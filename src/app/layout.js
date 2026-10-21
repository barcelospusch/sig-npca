import "./globals.css";

export const metadata = {
  title: "SIG-NPCA | Sistema Integrado de Gestão",
  description: "Gestão institucional do Núcleo de Pesquisa e Caça de Asteroides",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
