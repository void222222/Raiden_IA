// ==========================================================================
// DIAGNÓSTICO: INOFENSIVO / ÚTIL
// ==========================================================================
// É só uma função genérica de "sleep" (pausa) que o JavaScript não tem por padrão.
// Ele manda o código esperar X milissegundos antes de continuar.
// Provavelmente é usado em alguma transição, delay de áudio ou no motor 3D. MANTENHA.
// ==========================================================================

export const wait = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));