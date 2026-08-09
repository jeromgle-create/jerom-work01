import Link from "next/link";

const projects = [
  {
    name: "테트리스",
    description: "React useReducer로 만든 클래식 테트리스 게임. 회전, 고스트 피스, 레벨업까지 구현.",
    href: "/tetris",
    external: false,
  },
  {
    name: "핑퐁",
    description: "Canvas와 requestAnimationFrame으로 만든 AI 대전 핑퐁 게임.",
    href: "/pingpong",
    external: false,
  },
  {
    name: "볼링",
    description: "조준과 커브를 조절해 스트라이크를 노리는 10프레임 볼링 게임.",
    href: "/bowling",
    external: false,
  },
];

const contacts = [
  { label: "이메일", href: "mailto:jeromgle@gmail.com", value: "jeromgle@gmail.com" },
  { label: "GitHub", href: "https://github.com/jeromgle-create", value: "@jeromgle-create" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-16 px-6 py-20 sm:px-10 sm:py-28">
        <section className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            제롬글
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">개발자</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            프로젝트
          </h2>
          <div className="flex flex-col gap-3">
            {projects.map((project) => (
              <Link
                key={project.name}
                href={project.href}
                target={project.external ? "_blank" : undefined}
                rel={project.external ? "noopener noreferrer" : undefined}
                className="group flex flex-col gap-1 rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {project.name}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {project.description}
                </span>
                <span className="mt-2 text-sm font-medium text-zinc-950 group-hover:underline dark:text-zinc-50">
                  플레이하기 →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            연락처
          </h2>
          <div className="flex flex-wrap gap-3">
            {contacts.map((contact) => (
              <a
                key={contact.label}
                href={contact.href}
                target={contact.href.startsWith("http") ? "_blank" : undefined}
                rel={contact.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600"
              >
                <span className="text-zinc-500">{contact.label}</span>
                <span>{contact.value}</span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
