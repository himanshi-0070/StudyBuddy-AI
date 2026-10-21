import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { AuthProvider } from "./context/AuthContext";
import FirebaseTokenDebug from "./components/FirebaseTokenDebug";
import "./styles.css";

console.log("MAIN TSX EXECUTED");
const router = getRouter();

const rootElement = document.getElementById("root")!;

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <AuthProvider>

        {/* Temporary Firebase token generator */}
        <FirebaseTokenDebug />

        <RouterProvider router={router} />

      </AuthProvider>
    </StrictMode>,
  );
}