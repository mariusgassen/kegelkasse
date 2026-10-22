// vitest 5 gave `Assertion` a second type parameter (result type), so the augmentation shipped
// with @testing-library/jest-dom (`Assertion<T>`) no longer merges. Re-declare it with the new shape.
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any -- module augmentation must mirror vitest/jest-dom shapes */
import 'vitest'
import type {TestingLibraryMatchers} from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
    interface Assertion<R extends void | Promise<void> = void, T = unknown>
        extends TestingLibraryMatchers<any, T> {}
    interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
