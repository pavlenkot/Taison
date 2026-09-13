"use client";
import {
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";

export function ActionForm({
  action,
  children,
  className = "",
  closeOnSuccess = true,
}: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  closeOnSuccess?: boolean;
}) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    setSuccess(false);
    start(async () => {
      try {
        await action(data);
        setSuccess(true);
        if (closeOnSuccess) form.current?.closest("dialog")?.close();
        router.refresh();
      } catch (e) {
        if (
          typeof e === "object" &&
          e &&
          "digest" in e &&
          String(e.digest).startsWith("NEXT_REDIRECT")
        )
          throw e;
        const message = e instanceof Error ? e.message.split(": ")[0] : "";
        setError(
          message && !/Server Components|production builds/i.test(message)
            ? message
            : "Не вдалося зберегти. Перевірте введені дані й спробуйте ще раз.",
        );
      }
    });
  }
  return (
    <form
      ref={form}
      onSubmit={submit}
      className={className}
      aria-busy={pending}
    >
      <fieldset disabled={pending} className="action-fields">
        {children}
      </fieldset>
      {pending && (
        <p className="mt-3 text-sm text-muted" role="status">
          Зберігаю…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-positive" role="status">
          Збережено
        </p>
      )}
    </form>
  );
}
export function ConfirmAction({
  action,
  id,
  title,
  consequence,
  label = "Видалити",
  className = "btn-danger",
}: {
  action: (data: FormData) => Promise<void>;
  id: string;
  title: string;
  consequence: string;
  label?: string;
  className?: string;
}) {
  return (
    <Sheet
      title={title}
      trigger={
        <>
          <Icon name="trash" size={18} />
          {label}
        </>
      }
      className={className}
      icon="trash"
    >
      <p className="mb-6 text-muted">{consequence}</p>
      <ActionForm action={action}>
        <input type="hidden" name="id" value={id} />
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-ghost flex-1"
            onClick={(e) => e.currentTarget.closest("dialog")?.close()}
          >
            Скасувати
          </button>
          <button type="submit" className="btn-danger flex-1">
            Видалити
          </button>
        </div>
      </ActionForm>
    </Sheet>
  );
}
