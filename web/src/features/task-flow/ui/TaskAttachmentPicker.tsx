import { useRef, useState, type ChangeEvent } from "react";

import type { TaskFlowAttachmentInput } from "@/features/task-flow/model/task-flow.types";

type TaskAttachmentPickerProps = {
  disabled?: boolean;
  label?: string;
  onChange: (attachments: TaskFlowAttachmentInput[]) => void;
  value?: TaskFlowAttachmentInput[];
};

const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TASK_ATTACHMENT_COUNT = 20;

export function TaskAttachmentPicker({
  disabled = false,
  label = "Files",
  onChange,
  value = [],
}: TaskAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  const handleFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    if (!files.length) {
      return;
    }
    if (value.length + files.length > MAX_TASK_ATTACHMENT_COUNT) {
      setError(`Attach no more than ${MAX_TASK_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    const nextAttachments: TaskFlowAttachmentInput[] = [];
    for (const file of files) {
      if (file.size <= 0) {
        setError(`File "${file.name}" is empty.`);
        return;
      }
      if (file.size > MAX_TASK_ATTACHMENT_BYTES) {
        setError(`File "${file.name}" is larger than 10 MB.`);
        return;
      }
      nextAttachments.push({
        byte_size: file.size,
        content_base64: await fileToBase64(file),
        content_type: file.type || null,
        kind: inferAttachmentKind(file),
        name: file.name,
      });
    }
    onChange([...value, ...nextAttachments]);
  };

  const removeAttachment = (index: number) => {
    onChange(value.filter((_attachment, attachmentIndex) => attachmentIndex !== index));
  };

  return (
    <div className="field attachment-picker">
      <div className="attachment-picker__head">
        <span className="field__label">{label}</span>
        <button
          className="button button--ghost button--tiny"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Attach files
        </button>
      </div>
      <input
        aria-label={`${label} upload`}
        className="attachment-picker__input"
        disabled={disabled}
        multiple
        onChange={(event) => void handleFilesChange(event)}
        ref={inputRef}
        type="file"
      />
      {value.length ? (
        <div className="attachment-list">
          {value.map((attachment, index) => (
            <div className="attachment-list__item" key={`${attachment.name}-${attachment.byte_size || 0}-${index}`}>
              <div>
                <strong>{attachment.name}</strong>
                <span>{formatBytes(attachment.byte_size || 0)} / {attachment.content_type || attachment.kind || "file"}</span>
              </div>
              <button
                aria-label={`Remove ${attachment.name}`}
                className="button button--ghost button--tiny"
                disabled={disabled}
                onClick={() => removeAttachment(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="field__hint">Optional. Each file is stored on the task and shown to the assigned employee.</span>
      )}
      {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
    </div>
  );
}

export function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File) {
  if (typeof file.arrayBuffer === "function") {
    return arrayBufferToBase64(await file.arrayBuffer());
  }
  return fileToBase64WithReader(file);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function inferAttachmentKind(file: File) {
  const type = file.type || "";
  if (type.startsWith("text/") || ["application/json", "application/xml", "text/markdown"].includes(type)) {
    return "text";
  }
  if (type.startsWith("image/")) {
    return "image";
  }
  if (type === "application/pdf" || type.includes("document")) {
    return "document";
  }
  return "file";
}

function fileToBase64WithReader(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
