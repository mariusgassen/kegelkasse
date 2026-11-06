"""A small in-process search index over the Docusaurus docs (``docs/docs/*.md``).

The AI search (``/ai/ask``) hands Claude the few doc sections that best match a question,
so answers about "how do I …" come from the documentation instead of the model's guesses.

Kept deliberately simple: the docs are ~130 KB of Markdown, so the whole corpus is read and
chunked once per process (one chunk per ``##`` section) and ranked with BM25 over a crude
German-aware tokenizer. No embeddings, no vector store, no build step — the Markdown ships
in the image (``COPY docs/docs ./docs_src``) and is indexed on first use.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from core.config import settings

_APP_DIR = Path(__file__).resolve().parent.parent  # backend/app
_CANDIDATES = (
    _APP_DIR.parent / "docs_src",             # Docker image: /app/docs_src
    _APP_DIR.parent.parent / "docs" / "docs",  # repo checkout (dev, tests)
)

MAX_CHUNK_CHARS = 1800

_FOLD = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "ss"})
_WORD = re.compile(r"[a-z0-9]+")
_SUFFIXES = ("ungen", "ung", "en", "er", "es", "e", "n", "s")
# Very common words that carry no meaning for retrieval (German + English UI questions).
_STOP = {
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "und",
    "oder", "ist", "sind", "wie", "was", "wo", "wer", "wann", "kann", "ich", "mich", "mir",
    "mein", "meine", "du", "man", "im", "in", "an", "am", "auf", "zu", "zum", "zur", "mit",
    "fur", "von", "bei", "es", "sich", "nicht", "auch", "the", "how", "what", "can", "do",
    "to", "of", "and", "is", "my", "an", "for", "where", "hier", "dann", "wird", "werden",
}


def tokenize(text: str) -> list[str]:
    """Lowercase, fold umlauts, drop stop words, strip common German endings."""
    out = []
    for w in _WORD.findall(text.lower().translate(_FOLD)):
        if len(w) < 2 or w in _STOP:
            continue
        for suf in _SUFFIXES:
            if len(w) - len(suf) >= 4 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.append(w)
    return out


def heading_anchor(text: str) -> str:
    """The anchor Docusaurus (github-slugger) gives a heading: lowercase, punctuation and
    emoji removed, spaces become hyphens. Umlauts stay."""
    s = re.sub(r"\{#([^}]+)\}\s*$", "", text)  # explicit {#id} is handled by the caller
    s = s.strip().lower()
    s = re.sub(r"[`*_]", "", s)
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


@dataclass
class DocChunk:
    path: str            # doc route below /docs/, e.g. "funktionen/kasse" ("" = intro)
    page_title: str
    heading: str | None
    anchor: str | None
    text: str
    tokens: list[str] = field(default_factory=list, repr=False)

    @property
    def link(self) -> str:
        """The in-answer link form the AI is told to use: ``docs:<path>#<anchor>``."""
        return f"docs:{self.path}" + (f"#{self.anchor}" if self.anchor else "")

    @property
    def url(self) -> str:
        return doc_url(self.path, self.anchor)

    @property
    def title(self) -> str:
        return f"{self.page_title} → {self.heading}" if self.heading else self.page_title


def doc_url(path: str, anchor: str | None = None) -> str:
    base = "/docs/" + (f"{path}" if path else "")
    return base + (f"#{anchor}" if anchor else "")


def _frontmatter(src: str) -> tuple[dict, str]:
    if not src.startswith("---"):
        return {}, src
    end = src.find("\n---", 3)
    if end == -1:
        return {}, src
    meta = {}
    for line in src[3:end].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip("'\"")
    return meta, src[end + 4:]


def _route(rel: Path, meta: dict) -> str:
    slug = meta.get("slug")
    if slug:
        return slug.strip("/")
    parts = list(rel.with_suffix("").parts)
    if meta.get("id"):
        parts[-1] = meta["id"]
    return "/".join(parts)


def _chunks_for(rel: Path, src: str) -> list[DocChunk]:
    meta, body = _frontmatter(src)
    path = _route(rel, meta)
    h1 = None
    sections: list[tuple[str | None, list[str]]] = [(None, [])]
    in_code = False
    for line in body.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        if not in_code and line.startswith("## "):
            sections.append((line[3:].strip(), []))
            continue
        if not in_code and line.startswith("# ") and len(sections) == 1 and not any(l.strip() for l in sections[0][1]):
            h1 = line[2:].strip()  # page H1: the title when frontmatter has none
            continue
        sections[-1][1].append(line)

    page_title = meta.get("title") or h1 or rel.stem
    chunks = []
    for heading, lines in sections:
        text = "\n".join(l for l in lines if l.strip() != "---").strip()
        if not text and not heading:
            continue
        anchor = None
        if heading:
            explicit = re.search(r"\{#([^}]+)\}\s*$", heading)
            anchor = explicit.group(1) if explicit else heading_anchor(heading)
            heading = re.sub(r"[`*_]", "", re.sub(r"\s*\{#[^}]+\}\s*$", "", heading)).strip()
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS].rsplit("\n", 1)[0] + "\n…"
        c = DocChunk(path=path, page_title=page_title, heading=heading, anchor=anchor, text=text)
        # Titles weigh more than body text: they name what the section is about.
        c.tokens = tokenize(f"{page_title} {heading or ''} " * 3 + text)
        chunks.append(c)
    return chunks


def docs_dir() -> Path | None:
    configured = getattr(settings, "DOCS_SOURCE_DIR", "") or ""
    for d in ([Path(configured)] if configured else []) + list(_CANDIDATES):
        if d.is_dir():
            return d
    return None


class DocsIndex:
    """BM25 over doc sections."""

    K1 = 1.4
    B = 0.75

    def __init__(self, chunks: list[DocChunk]):
        self.chunks = chunks
        self.paths = {c.path for c in chunks}
        self.anchors = {(c.path, c.anchor) for c in chunks if c.anchor}
        self._tf = [Counter(c.tokens) for c in chunks]
        self._len = [len(c.tokens) for c in chunks]
        self._avg = (sum(self._len) / len(self._len)) if chunks else 0.0
        df: Counter = Counter()
        for tf in self._tf:
            df.update(tf.keys())
        n = len(chunks)
        self._idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}

    def search(self, query: str, k: int = 5) -> list[DocChunk]:
        terms = set(tokenize(query))
        if not terms or not self.chunks:
            return []
        # German compounds: "Strafe" should also find "Strafenarten". A query term matches
        # longer words that start with it, at half weight.
        weights: dict[str, float] = {}
        for t in terms:
            weights[t] = max(weights.get(t, 0), 1.0)
            if len(t) >= 4:
                for v in self._idf:
                    if v != t and v.startswith(t):
                        weights[v] = max(weights.get(v, 0), 0.5)
        scored = []
        for i, tf in enumerate(self._tf):
            score = 0.0
            norm = self.K1 * (1 - self.B + self.B * self._len[i] / (self._avg or 1))
            for t, w in weights.items():
                f = tf.get(t)
                if not f:
                    continue
                score += w * self._idf[t] * f * (self.K1 + 1) / (f + norm)
            if score > 0:
                scored.append((score, i))
        scored.sort(reverse=True)
        return [self.chunks[i] for _, i in scored[:k]]

    def has(self, path: str, anchor: str | None = None) -> bool:
        if anchor:
            return (path, anchor) in self.anchors
        return path in self.paths


def build_index(root: Path | None) -> DocsIndex:
    chunks: list[DocChunk] = []
    if root is not None:
        for f in sorted(root.rglob("*.md")):
            chunks.extend(_chunks_for(f.relative_to(root), f.read_text(encoding="utf-8")))
    return DocsIndex(chunks)


@lru_cache(maxsize=1)
def get_index() -> DocsIndex:
    """The process-wide index, built on first use from the shipped Markdown."""
    return build_index(docs_dir())
