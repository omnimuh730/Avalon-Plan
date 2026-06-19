import { BrowserRouter } from "react-router";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { AppRoutes } from "./app/router/AppRoutes";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </ThemeProvider>,
);
