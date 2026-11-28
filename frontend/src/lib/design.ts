import {useAppStore} from '@/store/app'
import type {UiDesign, User} from '@/types'

/** Anything but an explicit "new" is the classic look, so nobody is switched without choosing. */
export function getUiDesign(user: Pick<User, 'ui_design'> | null | undefined): UiDesign {
    return user?.ui_design === 'new' ? 'new' : 'classic'
}

/** The signed-in member's look. */
export function useUiDesign(): UiDesign {
    return useAppStore(s => getUiDesign(s?.user))
}

/** Marks the document so the new design's styles (`design/new.css`) apply. */
export function applyUiDesign(design: UiDesign, root: HTMLElement = document.documentElement) {
    root.dataset.design = design
}
