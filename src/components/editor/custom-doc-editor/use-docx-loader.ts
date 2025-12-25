/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, Dispatch, SetStateAction } from 'react';
import { Editor } from '@tiptap/react';
import { DocxReader } from '../../../lib/docx/DocxReader';
import { Comment } from './types';

interface UseDocxLoaderProps {
    file?: File;
    editor: Editor | null;
    setDocAttrs: Dispatch<SetStateAction<any>>;
    setComments: Dispatch<SetStateAction<Comment[]>>;
}

export const useDocxLoader = ({ file, editor, setDocAttrs, setComments }: UseDocxLoaderProps) => {
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!file || !editor) return;

        const loadFile = async () => {
            setIsLoading(true);
            try {
                const arrayBuffer = await file.arrayBuffer();
                const reader = new DocxReader();
                const content = await reader.load(arrayBuffer);

                if (content.attrs) {
                    setDocAttrs(content.attrs);
                }

                editor.commands.setContent(content);

                // Extract comments
                const extractedComments: Comment[] = [];
                const seenIds = new Set<string>();
                editor.state.doc.descendants((node) => {
                    node.marks.forEach((mark) => {
                        if (mark.type.name === 'comment') {
                            const { commentId, author, date, content: commentContent } = mark.attrs;
                            if (commentId && !seenIds.has(commentId)) {
                                seenIds.add(commentId);
                                extractedComments.push({
                                    id: commentId,
                                    author: author || 'Unknown',
                                    date: date || '',
                                    content: commentContent || '',
                                });
                            }
                        }
                    });
                    return true;
                });
                setComments(extractedComments);
            } catch (error) {
                console.error('Failed to load DOCX:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadFile();
    }, [file, editor, setDocAttrs, setComments]);

    return { isLoading };
};
