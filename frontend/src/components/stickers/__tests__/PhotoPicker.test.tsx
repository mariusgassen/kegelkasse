import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {useState} from 'react'

vi.mock('@/i18n', () => ({useT: () => (k: string) => k}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
const mockUpload = vi.fn()
vi.mock('@/api/client.ts', () => ({uploadMedia: (f: File) => mockUpload(f)}))
vi.mock('../PhotoEditor.tsx', () => ({
    PhotoEditor: ({onApply, onCancel}: any) => (
        <div><button onClick={() => onApply(new File(['e'], 'e.jpg'))}>apply-edit</button><button onClick={onCancel}>cancel-edit</button></div>
    ),
}))

import {PhotoPicker, type Photo} from '../PhotoPicker'

function Harness({initial = [], onFiles}: {initial?: Photo[]; onFiles?: (f: File[]) => void}) {
    const [photos, setPhotos] = useState<Photo[]>(initial)
    return <PhotoPicker photos={photos} onChange={setPhotos} onFiles={onFiles}/>
}
const pick = (...names: string[]) => fireEvent.change(screen.getByTestId('photo-input'), {
    target: {files: names.map(n => new File(['x'], n, {type: 'image/jpeg'}))},
})

describe('PhotoPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        let n = 0
        mockUpload.mockImplementation(async () => `/uploads/media/p${++n}.jpg`)
    })

    it('starts as one large tile asking for photos', () => {
        render(<Harness/>)
        expect(screen.getByText('stickers.form.pickPhotos')).toBeInTheDocument()
        expect(screen.getByText('stickers.form.photoRequired')).toBeInTheDocument()
    })

    it('uploads several photos at once, hands the originals on and numbers them', async () => {
        const onFiles = vi.fn()
        render(<Harness onFiles={onFiles}/>)
        pick('a.jpg', 'b.jpg', 'c.jpg')
        await waitFor(() => screen.getByText('1/3'))
        expect(onFiles).toHaveBeenCalledWith(expect.arrayContaining([expect.any(File)]))
        expect(onFiles.mock.calls[0][0]).toHaveLength(3)
        expect(mockUpload).toHaveBeenCalledTimes(3)
        expect(screen.getByLabelText('stickers.form.photo 1')).toBeInTheDocument()
        expect(screen.getByLabelText('stickers.form.photo 3')).toBeInTheDocument()
    })

    it('shows no counter for a single photo', async () => {
        render(<Harness/>)
        pick('a.jpg')
        await waitFor(() => screen.getByText('action.edit'))
        expect(screen.queryByText('1/1')).not.toBeInTheDocument()
    })

    it('selects a photo from the strip and removes it', async () => {
        render(<Harness initial={[{url: '/1'}, {url: '/2'}]}/>)
        fireEvent.click(screen.getByLabelText('stickers.form.photo 2'))
        expect(screen.getByText('2/2')).toBeInTheDocument()
        fireEvent.click(screen.getByText('stickers.form.removePhoto'))
        expect(screen.queryByLabelText('stickers.form.photo 2')).not.toBeInTheDocument()
        expect(screen.getByLabelText('stickers.form.photo 1')).toBeInTheDocument()
    })

    it('returns to the large tile after removing the last photo', () => {
        render(<Harness initial={[{url: '/1'}]}/>)
        fireEvent.click(screen.getByText('stickers.form.removePhoto'))
        expect(screen.getByText('stickers.form.pickPhotos')).toBeInTheDocument()
    })

    it('replaces the photo with the uploaded edit', async () => {
        render(<Harness initial={[{url: '/old'}]}/>)
        fireEvent.click(screen.getByText('action.edit'))
        fireEvent.click(screen.getByText('apply-edit'))
        await waitFor(() => expect(screen.queryByText('apply-edit')).not.toBeInTheDocument())
        expect(screen.getByAltText('stickers.form.photo 1')).toHaveAttribute('src', '/uploads/media/p1.jpg')
    })

    it('keeps the photo when the edit is cancelled', () => {
        render(<Harness initial={[{url: '/old'}]}/>)
        fireEvent.click(screen.getByText('action.edit'))
        fireEvent.click(screen.getByText('cancel-edit'))
        expect(screen.getByAltText('stickers.form.photo 1')).toHaveAttribute('src', '/old')
        expect(mockUpload).not.toHaveBeenCalled()
    })

    it('stops offering more photos at the limit', () => {
        const ten = Array.from({length: 10}, (_, i) => ({url: `/${i}`}))
        render(<Harness initial={ten}/>)
        expect(screen.queryByLabelText('stickers.form.addPhotos')).not.toBeInTheDocument()
    })
})
