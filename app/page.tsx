import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold tracking-tight">Found</p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">
        Found reads your mail and shows the money you can still save.
      </h1>
      <Link
        href="/demo"
        className="inline-flex w-fit border border-[#1c1915] px-4 py-2 text-sm font-medium"
      >
        Open the morning desk
      </Link>
    </main>
  );
}
