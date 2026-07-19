'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { DiaryDocument, DiaryLinkSpan } from '@/lib/activity/diary-document';
import {
  diffLinkTexts,
  exitLinkOnTrailingDoubleSpace,
  getActiveLinkFromSelection,
  parseEditableRoot,
  populateEditableRoot,
} from '@/lib/activity/diary-editable-serialize';

export interface DiaryLinkedEditorHandle {
  insertTextAtCursor: (text: string) => void;
  enterEditMode: () => void;
}

interface DiaryLinkedEditorProps {
  document: DiaryDocument;
  loading?: boolean;
  contentReady?: boolean;
  focusedRecordId?: string | null;
  onFocusRecord?: (recordId: string | null) => void;
  onBodyChange: (body: string, links?: DiaryLinkSpan[]) => void;
  onLinkTextChange: (linkId: string, text: string) => void;
}

function linksEqual(a: DiaryLinkSpan[], b: DiaryLinkSpan[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((link, index) => {
    const other = b[index];
    return (
      link.id === other.id &&
      link.recordId === other.recordId &&
      link.start === other.start &&
      link.end === other.end
    );
  });
}

function insertTextIntoEditor(editor: HTMLElement, text: string): void {
  editor.focus();
  const selection = window.getSelection();
  if (!selection) return;

  let range: Range;
  if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    range = selection.getRangeAt(0);
  } else {
    range = window.document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  range.deleteContents();
  const textNode = window.document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

const DiaryLinkedEditor = forwardRef<DiaryLinkedEditorHandle, DiaryLinkedEditorProps>(
  function DiaryLinkedEditor(
    {
      document: diaryDocument,
      loading = false,
      contentReady = true,
      focusedRecordId = null,
      onFocusRecord,
      onBodyChange,
      onLinkTextChange,
    },
    ref
  ) {
    const shellRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const isEditingRef = useRef(false);
    const snapshotRef = useRef(parseEditableRoot(null, []));
    const composingRef = useRef(false);
    /** After typing "  " inside a link, plain-text mode until user clicks that link again. */
    const plainTextUntilClickRef = useRef(true);

    isEditingRef.current = isEditing;

    const syncEditorDom = useCallback(
      (doc: DiaryDocument, focusedId: string | null | undefined) => {
        const editor = editorRef.current;
        if (!editor || isEditingRef.current) return;
        populateEditableRoot(editor, doc.body, doc.links, focusedId);
        snapshotRef.current = parseEditableRoot(editor, doc.links);
      },
      []
    );

    useEffect(() => {
      syncEditorDom(diaryDocument, focusedRecordId);
    }, [diaryDocument.body, diaryDocument.links, focusedRecordId, syncEditorDom]);

    const flushEditor = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const parsed = parseEditableRoot(editor, diaryDocument.links);
      const changedLinkIds = diffLinkTexts(snapshotRef.current.linkTexts, parsed.linkTexts);
      const bodyChanged = parsed.body !== snapshotRef.current.body;
      const offsetsChanged = !linksEqual(parsed.links, snapshotRef.current.links);

      if (plainTextUntilClickRef.current && changedLinkIds.length > 0) {
        for (const linkId of changedLinkIds) {
          const text = parsed.linkTexts.get(linkId);
          if (text != null) onLinkTextChange(linkId, text);
        }
      }

      if (bodyChanged || offsetsChanged) {
        onBodyChange(parsed.body, parsed.links);
      }

      snapshotRef.current = parsed;
    }, [diaryDocument.links, onBodyChange, onLinkTextChange]);

    const enterEditMode = useCallback(() => {
      if (loading) return;
      plainTextUntilClickRef.current = true;
      setIsEditing(true);
      requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = window.document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }, [loading]);

    const insertTextAtCursor = useCallback(
      (text: string) => {
        const runInsert = () => {
          const editor = editorRef.current;
          if (!editor) return;
          insertTextIntoEditor(editor, text);
          flushEditor();
        };

        if (!isEditingRef.current) {
          enterEditMode();
          requestAnimationFrame(() => {
            requestAnimationFrame(runInsert);
          });
          return;
        }

        runInsert();
      },
      [enterEditMode, flushEditor]
    );

    useImperativeHandle(ref, () => ({ insertTextAtCursor, enterEditMode }), [
      insertTextAtCursor,
      enterEditMode,
    ]);

    const exitEditMode = useCallback(() => {
      flushEditor();
      setIsEditing(false);
      plainTextUntilClickRef.current = true;
      onFocusRecord?.(null);
    }, [flushEditor, onFocusRecord]);

    const handleInput = useCallback(() => {
      if (composingRef.current) return;

      const editor = editorRef.current;
      const selection = window.getSelection();
      if (editor && selection) {
        const exit = exitLinkOnTrailingDoubleSpace(editor, selection);
        if (exit.exited) {
          plainTextUntilClickRef.current = false;
          onFocusRecord?.(null);
        }
      }

      flushEditor();
    }, [flushEditor, onFocusRecord]);

    const updateActiveLinkFocus = useCallback(
      (fromClick = false) => {
        const editor = editorRef.current;
        if (!editor) return;

        const active = getActiveLinkFromSelection(editor);
        if (fromClick && active) {
          plainTextUntilClickRef.current = true;
        }

        if (!plainTextUntilClickRef.current && active) {
          onFocusRecord?.(null);
          if (isEditingRef.current) {
            for (const span of editor.querySelectorAll('[data-diary-link-id]')) {
              span.classList.remove('diary-record-link--focused');
            }
          }
          return;
        }

        onFocusRecord?.(active?.recordId ?? null);

        if (isEditingRef.current) {
          for (const span of editor.querySelectorAll('[data-diary-link-id]')) {
            span.classList.toggle(
              'diary-record-link--focused',
              active?.recordId === span.getAttribute('data-diary-record-id')
            );
          }
        }
      },
      [onFocusRecord]
    );

    useEffect(() => {
      if (!isEditing) return;

      const handleSelectionChange = () => updateActiveLinkFocus(false);
      window.document.addEventListener('selectionchange', handleSelectionChange);
      return () => window.document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isEditing, updateActiveLinkFocus]);

    useEffect(() => {
      if (!isEditing) return;

      const handlePointerDown = (event: MouseEvent) => {
        const shell = shellRef.current;
        if (!shell) return;
        if (!shell.contains(event.target as Node)) {
          exitEditMode();
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          exitEditMode();
        }
      };

      window.addEventListener('mousedown', handlePointerDown);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('mousedown', handlePointerDown);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [exitEditMode, isEditing]);

    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        if (!text) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(window.document.createTextNode(text));
        selection.collapseToEnd();
        handleInput();
      },
      [handleInput]
    );

    const isEmpty = !loading && !diaryDocument.body.trim() && diaryDocument.links.length === 0;

    if (isEmpty && !isEditing) {
      return (
        <div
          className={`flex h-full min-h-[8rem] cursor-text items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-sm text-slate-400 transition-opacity duration-300 ${
            contentReady ? 'opacity-100' : 'opacity-0'
          }`}
          onDoubleClick={enterEditMode}
        >
          日记为空。点击「从时间线写入」生成初稿并关联记录，或双击此处自由书写。
        </div>
      );
    }

    return (
      <div
        ref={shellRef}
        className={`absolute inset-0 flex min-h-0 flex-col transition-opacity duration-300 ${
          contentReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={[
            'diary-linked-editor relative min-h-0 flex-1 overflow-y-auto rounded-xl border bg-white px-3 py-2.5',
            isEditing ? 'diary-linked-editor--editing' : 'border-slate-200',
          ].join(' ')}
          onDoubleClick={(event) => {
            event.preventDefault();
            if (!isEditing) enterEditMode();
          }}
        >
          <div
            ref={editorRef}
            contentEditable={isEditing && !loading}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline
            aria-readonly={!isEditing}
            className="min-h-[6rem] whitespace-pre-wrap text-sm leading-relaxed text-slate-800 outline-none empty:before:text-slate-400 empty:before:content-['写下今天的感受与总结…']"
            onInput={handleInput}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              handleInput();
            }}
            onPaste={handlePaste}
            onClick={(event) => {
              if (isEditing) {
                const linkEl = (event.target as HTMLElement).closest('[data-diary-link-id]');
                updateActiveLinkFocus(Boolean(linkEl));
                return;
              }
              const linkEl = (event.target as HTMLElement).closest('[data-diary-record-id]');
              if (linkEl) {
                event.stopPropagation();
                const recordId = linkEl.getAttribute('data-diary-record-id');
                if (recordId) onFocusRecord?.(recordId);
              }
            }}
          />
        </div>
      </div>
    );
  }
);

export default DiaryLinkedEditor;
