export const TIME_ZONE = "America/Sao_Paulo";

export function localDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function formatTime(value) {
  return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Em andamento";
}
