/**
 * Conversación vacía: el personaje, una línea de presentación y lo que se puede pedir en esta pantalla
 * (lo resuelve el intérprete local, gratis). Si la cuenta tiene más asistentes, están ahí mismo: se ven
 * las caras y se cambia de uno a otro de un toque.
 */
import { useEffect, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import type { AssistantProfile, AvatarSpec } from "@dekopen/shared";
import { cn } from "../../../lib/cn";
import { useT } from "../../../lib/i18n";
import { Tooltip } from "../../../ui";
import type { FaceState } from "../face";
import es from "../i18n/es";
import { BotFace } from "./BotFace";

export interface WelcomeProps {
  name: string;
  avatar: AvatarSpec;
  greet: boolean;
  onGreeted(): void;
  suggestions: string[];
  onPick(text: string): void;
  compact?: boolean;
  /** Estado del personaje cuando no está saludando (p. ej. sin conexión). */
  face?: FaceState;
  /** Nota del modo sin IA (qué falta, en una línea), si aplica. */
  footer?: React.ReactNode;
  assistants?: readonly AssistantProfile[];
  activeId?: string | null;
  onAssistant?(id: string): void;
}

export function Welcome({
  name,
  avatar,
  greet,
  onGreeted,
  suggestions,
  onPick,
  compact,
  footer,
  face = "idle",
  assistants,
  activeId,
  onAssistant,
}: WelcomeProps) {
  const t = useT(es);
  const [greeting, setGreeting] = useState(greet);
  useEffect(() => {
    if (!greet) return;
    onGreeted();
    const timer = setTimeout(() => setGreeting(false), 1700);
    return () => clearTimeout(timer);
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const others = (assistants ?? []).filter((a) => a.id !== activeId);
  return (
    <div
      className={cn(
        "scrollbar-quiet flex min-h-0 flex-1 flex-col justify-end overflow-y-auto pb-2",
        compact ? "px-3 pt-4" : "px-4 pt-6",
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <BotFace
          spec={avatar}
          state={greeting ? "swirl" : face}
          size={compact ? 48 : 72}
          pokeable
          reactive
        />
        {others.length > 0 && onAssistant ? (
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label={t("empty.others")}
          >
            {others.slice(0, 4).map((a) => (
              <Tooltip key={a.id} content={a.name}>
                <button
                  type="button"
                  aria-label={t("panel.switchTo", { name: a.name })}
                  onClick={() => onAssistant(a.id)}
                  className="inline-flex size-9 items-center justify-center rounded-sm transition-[background-color,transform] duration-100 hover:bg-hover active:scale-[0.94] touch:size-11"
                >
                  <BotFace
                    spec={a.avatar}
                    state="idle"
                    size={26}
                    animated={false}
                  />
                </button>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>
      <h2 className="mt-3 font-display text-h3 font-medium text-fg-strong">
        {t("empty.hello", { name })}
      </h2>
      <p className="mt-1 text-base text-fg-muted">{t("empty.intro")}</p>
      {suggestions.length ? (
        <ul className="-mx-2 mt-4 flex flex-col" aria-label={t("empty.try")}>
          {suggestions.slice(0, 4).map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="group flex min-h-9 w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-base text-fg transition-colors duration-100 hover:bg-hover active:bg-pressed touch:min-h-11"
              >
                {s}
                <CornerDownLeft
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 shrink-0 text-fg-faint transition-colors duration-100 group-hover:text-fg-muted group-focus-visible:text-fg-muted"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
