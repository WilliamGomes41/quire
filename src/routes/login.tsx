import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { keepHint, kicker, productName } from "../copy";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  function send(form: HTMLFormElement, mode: "sign-in" | "create") {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const action =
      mode === "create"
        ? authClient.signUp.email({ email, password, name: "Owner" })
        : authClient.signIn.email({ email, password });
    action.then((result) => {
      if (result.error) {
        setMessage(result.error.message ?? "Could not sign in.");
        return;
      }
      setMessage("Signed in.");
      return router.navigate({ to: "/" });
    });
  }

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
          send(event.currentTarget, "sign-in");
        }}
      >
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Sign in</button>
        <button
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) send(form, "create");
          }}
        >
          Create owner account
        </button>
      </form>
      <p className="note">{message}</p>
    </main>
  );
}
