import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { keepHint, kicker, productName } from "../copy";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [message, setMessage] = useState("");

  return (
    <main>
      <nav>
        <Link to="/">{productName}</Link>
      </nav>
      <p className="kicker">{kicker}</p>
      <h1>Owner sign in</h1>
      <p className="empty">{keepHint}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const email = String(form.get("email") ?? "");
          const password = String(form.get("password") ?? "");
          authClient.signIn.email({ email, password }).then((result) => {
            setMessage(result.error?.message ?? "Signed in.");
          });
        }}
      >
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Sign in</button>
      </form>
      <p className="note">{message}</p>
    </main>
  );
}
