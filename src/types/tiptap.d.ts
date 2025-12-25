/* eslint-disable @typescript-eslint/no-explicit-any */
import '@tiptap/core';

declare module '@tiptap/core' {
    interface Commands<ReturnType = any> {
        trackChanges: {
            /**
             * Go to the previous change
             */
            goToPreviousChange: () => ReturnType;
            /**
             * Go to the next change
             */
            goToNextChange: () => ReturnType;
            /**
             * Accept the current change
             */
            acceptChange: () => ReturnType;
            /**
             * Reject the current change
             */
            rejectChange: () => ReturnType;
            /**
             * Accept all changes
             */
            acceptAllChanges: () => ReturnType;
            /**
             * Reject all changes
             */
            rejectAllChanges: () => ReturnType;
        };
    }
}
