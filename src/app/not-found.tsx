import { Icon } from "@/components/Icon";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mb-4 flex justify-center">
        <Icon name="search" size={44} />
      </div>
      <h1 className="text-xl font-bold">Сторінки немає</h1>
      <p className="mt-2 text-sm text-muted">
        Можливо, запис видалено або посилання застаріло.
      </p>
      <Link href="/" className="btn-primary mt-6 inline-flex">
        На головну
      </Link>
    </div>
  );
}
