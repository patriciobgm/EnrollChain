import { apiResponse } from "./api";

export async function downloadDocument(
  id: string,
  filename: string,
): Promise<void> {
  const response = await apiResponse(`/documents/${id}/download/`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
