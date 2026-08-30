import { formatDate } from "@/lib/format";
import { REPEAT_LABELS, type Task } from "@/lib/types";
import { completeTask, deleteTask } from "@/app/actions";

export function TaskRow({ task }: { task: Task }) {
  return (
    <li className="card flex items-center gap-3">
      <form action={completeTask} className="flex">
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          aria-label={`Позначити «${task.title}» виконаним`}
          className="size-6 shrink-0 rounded-full border-2 border-line transition hover:border-positive hover:bg-positive/10"
        />
      </form>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{task.title}</span>
        <span className="block truncate text-xs text-muted">
          {formatDate(task.due_on)}
          {task.repeat !== "none" ? ` · ${REPEAT_LABELS[task.repeat]}` : ""}
          {task.note ? ` · ${task.note}` : ""}
        </span>
      </span>

      <form action={deleteTask}>
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          aria-label={`Видалити «${task.title}»`}
          className="shrink-0 px-1 text-muted hover:text-negative"
        >
          ✕
        </button>
      </form>
    </li>
  );
}
