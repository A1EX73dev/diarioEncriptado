/** Descarga un texto generado en el navegador (no pasa por el servidor). */
export function downloadText(fileName: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Se revoca después para que el navegador haya iniciado la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
