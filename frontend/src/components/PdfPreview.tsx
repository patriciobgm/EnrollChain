import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { apiResponse } from "../lib/api";
import { ErrorMessage } from "./Form";
import { Button } from "./ui/Button";
import { LoadingState } from "./ui/LoadingState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/Dialog";

interface PdfProps {
  id: string;
  filename: string;
}

function PdfPages({ id, filename }: PdfProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<unknown>(null);
  const [rendering, setRendering] = useState(false);
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(600);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    vertical: HTMLElement;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, Math.floor(entry.contentRect.width))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const controller = new AbortController();
    async function load() {
      setError(null);
      setPdf(null);
      setPage(1);
      try {
        const response = await apiResponse(`/documents/${id}/preview/`, {
          signal: controller.signal,
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdfjs.getDocument({
          data: bytes,
          useSystemFonts: true,
        });
        destroy = () => {
          void task.destroy();
        };
        const loaded = await task.promise;
        if (!cancelled) setPdf(loaded);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      destroy?.();
    };
  }, [id, attempt]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    const target = canvas.current;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    async function renderPage() {
      setRendering(true);
      setText("");
      try {
        const current = await pdf!.getPage(page);
        if (cancelled) return;
        const base = current.getViewport({ scale: 1 });
        const scale = Math.min(width / base.width, 1.5) * zoom;
        const viewport = current.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        const task = current.render({
          canvas: target,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        cancelRender = () => task.cancel();
        await task.promise;
        const content = await current.getTextContent();
        if (!cancelled)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    void renderPage();
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, page, zoom, width]);
  return (
    <section
      aria-label={`PDF preview: ${filename}`}
      className="min-w-0 space-y-3"
    >
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="PDF page controls"
      >
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous PDF page"
          disabled={!pdf || page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span role="status" className="text-sm tabular-nums">
          Page {page} of {pdf?.numPages ?? "—"}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Next PDF page"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <span className="text-xs">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
      </div>
      <ErrorMessage error={error} />
      {error != null && (
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry PDF preview
        </Button>
      )}
      {!pdf && !error && <LoadingState label="Opening private PDF…" />}
      <div
        ref={container}
        className={`relative overflow-x-auto rounded-xl border border-line bg-black/5 p-2 ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const target = event.currentTarget;
          let vertical: HTMLElement = target;
          for (
            let node = target.parentElement;
            node;
            node = node.parentElement
          ) {
            if (
              /(auto|scroll)/.test(getComputedStyle(node).overflowY) &&
              node.scrollHeight > node.clientHeight
            ) {
              vertical = node;
              break;
            }
          }
          pan.current = {
            x: event.clientX,
            y: event.clientY,
            left: target.scrollLeft,
            top: vertical.scrollTop,
            vertical,
          };
          target.setPointerCapture(event.pointerId);
          setDragging(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const start = pan.current;
          if (!start) return;
          event.currentTarget.scrollLeft =
            start.left - (event.clientX - start.x);
          start.vertical.scrollTop = start.top - (event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          pan.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          pan.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          pan.current = null;
          setDragging(false);
        }}
        tabIndex={0}
        aria-label="Scrollable PDF page"
      >
        {rendering && (
          <p
            role="status"
            className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg bg-surface/95 p-2 text-sm shadow-sm"
          >
            Rendering page…
          </p>
        )}
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${filename}, page ${page}. Extracted text is available below when present.`}
          className="mx-auto bg-white shadow-sm"
        />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer py-2 font-medium">
          Accessible page text
        </summary>
        <p className="whitespace-pre-wrap leading-6">
          {text ||
            "No extractable text on this page. Scanned documents may require an accessible copy from the issuing school."}
        </p>
      </details>
    </section>
  );
}

export function PdfPreview(props: PdfProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Eye aria-hidden="true" />
        {open ? "Close PDF preview" : "Preview PDF"}
      </Button>
      {open && <PdfPages {...props} />}
    </div>
  );
}

export function PdfPreviewDialog(props: PdfProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Eye aria-hidden="true" />
          Preview PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogTitle>Document Preview</DialogTitle>
        <DialogDescription>{props.filename}</DialogDescription>
        <div className="mt-5">
          <PdfPages {...props} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
