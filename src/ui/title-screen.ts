export type TitleScreenChoice = "continue" | "new-game";

export interface TitleContinueInfo {
  available: boolean;
  title?: string;
  detail?: string;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  depth: number;
}

interface Traffic {
  phase: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

const STYLE_ID = "title-screen-styles";

const STYLE_TEXT = `
#title-screen {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  overflow: hidden;
  background: #03050a;
  color: #f1f5f8;
  font-family: Consolas, Menlo, Monaco, monospace;
}
#title-screen .title-screen-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
#title-screen .title-screen-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(3, 5, 10, 0.05) 0%, rgba(3, 5, 10, 0.38) 52%, rgba(3, 5, 10, 0.78) 100%);
}
#title-screen .title-screen-content {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 48px max(28px, 8vw);
}
#title-screen .title-screen-heading {
  max-width: 570px;
}
#title-screen h1 {
  margin: 0;
  color: #f4f7f5;
  font-family: Arial, Helvetica, sans-serif;
  font-size: clamp(44px, 8vw, 94px);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 0.9;
  text-wrap: balance;
}
#title-screen .title-screen-subtitle {
  max-width: 340px;
  margin: 20px 0 0;
  color: #aebbc3;
  font-size: 12px;
  letter-spacing: 0.13em;
  line-height: 1.6;
  text-transform: uppercase;
}
#title-screen .title-screen-commands {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(100%, 320px);
  margin-top: 46px;
}
#title-screen .title-screen-command {
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  padding: 12px 16px;
  border: 1px solid rgba(192, 212, 218, 0.42);
  border-radius: 2px;
  background: rgba(6, 11, 18, 0.58);
  color: #eff5f5;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}
#title-screen .title-screen-command:hover {
  border-color: #d6e6dc;
  background: rgba(27, 53, 57, 0.76);
}
#title-screen .title-screen-command:focus-visible {
  outline: 2px solid #c2e6d0;
  outline-offset: 3px;
}
#title-screen .title-screen-command:disabled {
  border-color: rgba(143, 157, 165, 0.25);
  background: rgba(7, 11, 17, 0.46);
  color: #77838a;
  cursor: not-allowed;
}
#title-screen .title-screen-command-label,
#title-screen .title-screen-command-detail {
  display: block;
}
#title-screen .title-screen-command-label {
  font-size: 14px;
  letter-spacing: 0.1em;
  line-height: 1.25;
  text-transform: uppercase;
}
#title-screen .title-screen-command-detail {
  margin-top: 4px;
  color: #9eafb5;
  font-size: 11px;
  letter-spacing: 0.02em;
  line-height: 1.3;
}
#title-screen .title-screen-command:disabled .title-screen-command-detail {
  color: #718087;
}
@media (max-width: 620px) {
  #title-screen .title-screen-content {
    justify-content: flex-end;
    padding: 34px 28px 48px;
  }
  #title-screen h1 { font-size: clamp(42px, 14vw, 70px); }
  #title-screen .title-screen-commands { margin-top: 34px; }
}
`;

function createStars(): Star[] {
  return Array.from({ length: 170 }, (_, index) => {
    const depth = 0.25 + Math.random() * 0.75;
    return {
      x: Math.random(),
      y: Math.random(),
      size: index % 17 === 0 ? 1.5 : 0.45 + Math.random() * 0.85,
      alpha: 0.18 + Math.random() * 0.74,
      speed: 0.0009 + Math.random() * 0.0032,
      depth
    };
  });
}

function createTraffic(): Traffic[] {
  return Array.from({ length: 4 }, () => ({
    phase: Math.random(),
    y: 0.24 + Math.random() * 0.42,
    speed: 0.018 + Math.random() * 0.025,
    length: 12 + Math.random() * 20,
    alpha: 0.25 + Math.random() * 0.34
  }));
}

function wrap(value: number): number {
  return value - Math.floor(value);
}

function drawPlanet(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const radius = Math.max(width, height) * 0.61;
  const x = width * 0.04;
  const y = height * 1.04;
  const planet = ctx.createRadialGradient(x + radius * 0.1, y - radius * 0.22, radius * 0.08, x, y, radius);
  planet.addColorStop(0, "#4e8e96");
  planet.addColorStop(0.42, "#1f4b5b");
  planet.addColorStop(0.78, "#0c1a29");
  planet.addColorStop(1, "#02050a");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = "rgba(126, 221, 210, 0.26)";
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0022);
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.008, Math.PI * 1.13, Math.PI * 1.82);
  ctx.stroke();
  ctx.restore();
}

function drawStation(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = width * 0.76;
  const y = height * 0.48;
  const scale = Math.max(0.65, Math.min(width, height) / 900);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "rgba(124, 155, 164, 0.5)";
  ctx.fillStyle = "rgba(9, 19, 28, 0.94)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-98, 3);
  ctx.lineTo(-25, -5);
  ctx.lineTo(-8, -20);
  ctx.lineTo(12, -20);
  ctx.lineTo(31, -5);
  ctx.lineTo(104, 2);
  ctx.lineTo(104, 11);
  ctx.lineTo(30, 7);
  ctx.lineTo(11, 24);
  ctx.lineTo(-9, 24);
  ctx.lineTo(-27, 7);
  ctx.lineTo(-98, 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(154, 220, 203, 0.84)";
  ctx.fillRect(-3, -29, 7, 11);
  ctx.fillRect(-54, 2, 8, 3);
  ctx.fillRect(46, 2, 8, 3);
  ctx.strokeStyle = "rgba(125, 165, 173, 0.34)";
  ctx.beginPath();
  ctx.moveTo(-73, 7);
  ctx.lineTo(-111, 30);
  ctx.moveTo(75, 7);
  ctx.lineTo(114, 29);
  ctx.stroke();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stars: Star[],
  traffic: Traffic[],
  seconds: number,
  animate: boolean
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#03050a";
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const drift = animate ? seconds * star.speed * star.depth : 0;
    const x = wrap(star.x - drift) * width;
    const y = star.y * height;
    ctx.fillStyle = `rgba(206, 224, 231, ${star.alpha})`;
    ctx.fillRect(x, y, star.size, star.size);
  }

  drawPlanet(ctx, width, height);
  drawStation(ctx, width, height);

  if (animate) {
    for (const ship of traffic) {
      const progress = wrap(ship.phase + seconds * ship.speed);
      const x = (progress * 1.26 - 0.13) * width;
      const y = ship.y * height + Math.sin(seconds * 0.65 + ship.phase * 8) * 5;
      ctx.save();
      ctx.strokeStyle = `rgba(188, 229, 222, ${ship.alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - ship.length, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(235, 249, 242, ${Math.min(1, ship.alpha + 0.3)})`;
      ctx.fillRect(x, y - 1, 2, 2);
      ctx.restore();
    }
  }
}

function installStyles(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
  return style;
}

export function mountTitleScreen(options: { continueInfo: TitleContinueInfo }): Promise<TitleScreenChoice> {
  const style = installStyles();
  const root = document.createElement("section");
  root.id = "title-screen";
  root.setAttribute("aria-label", "Starlight Station title screen");

  const canvas = document.createElement("canvas");
  canvas.className = "title-screen-canvas";
  canvas.setAttribute("aria-hidden", "true");
  root.appendChild(canvas);

  const shade = document.createElement("div");
  shade.className = "title-screen-shade";
  root.appendChild(shade);

  const content = document.createElement("main");
  content.className = "title-screen-content";
  const heading = document.createElement("div");
  heading.className = "title-screen-heading";
  const title = document.createElement("h1");
  title.textContent = "STARLIGHT STATION";
  const subtitle = document.createElement("p");
  subtitle.className = "title-screen-subtitle";
  subtitle.textContent = "A home between the quiet stars";
  heading.append(title, subtitle);

  const commands = document.createElement("div");
  commands.className = "title-screen-commands";
  const newGame = document.createElement("button");
  newGame.className = "title-screen-command";
  newGame.type = "button";
  const newGameLabel = document.createElement("span");
  newGameLabel.className = "title-screen-command-label";
  newGameLabel.textContent = "New Game";
  newGame.appendChild(newGameLabel);

  const continueGame = document.createElement("button");
  continueGame.className = "title-screen-command";
  continueGame.type = "button";
  continueGame.disabled = !options.continueInfo.available;
  const continueLabel = document.createElement("span");
  continueLabel.className = "title-screen-command-label";
  continueLabel.textContent = "Continue";
  const continueDetail = document.createElement("span");
  continueDetail.className = "title-screen-command-detail";
  const saveTitle = options.continueInfo.title?.trim();
  const saveDetail = options.continueInfo.detail?.trim();
  continueDetail.textContent = options.continueInfo.available
    ? [saveTitle, saveDetail].filter(Boolean).join(" - ")
    : "No station on record";
  continueGame.append(continueLabel, continueDetail);
  if (continueGame.disabled) continueGame.setAttribute("aria-describedby", "title-screen-no-save");
  if (!options.continueInfo.available) continueDetail.id = "title-screen-no-save";

  commands.append(newGame, continueGame);
  content.append(heading, commands);
  root.appendChild(content);
  document.body.appendChild(root);

  const context = canvas.getContext("2d");
  const stars = createStars();
  const traffic = createTraffic();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  let frame = 0;
  let resolved = false;
  let width = 0;
  let height = 0;

  const render = (timestamp = 0): void => {
    if (!context || resolved) return;
    drawScene(context, width, height, stars, traffic, timestamp / 1000, !reducedMotion);
    if (!reducedMotion) frame = window.requestAnimationFrame(render);
  };

  const resize = (): void => {
    const bounds = root.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reducedMotion) render();
  };

  const onMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    window.cancelAnimationFrame(frame);
    render(performance.now());
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") event.preventDefault();
  };

  return new Promise<TitleScreenChoice>((resolve) => {
    const finish = (choice: TitleScreenChoice): void => {
      if (resolved) return;
      resolved = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown, true);
      motionQuery.removeEventListener("change", onMotionChange);
      root.remove();
      style.remove();
      resolve(choice);
    };

    newGame.addEventListener("click", () => finish("new-game"));
    continueGame.addEventListener("click", () => finish("continue"));
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown, true);
    motionQuery.addEventListener("change", onMotionChange);
    resize();
    render();
    window.requestAnimationFrame(() => (options.continueInfo.available ? continueGame : newGame).focus());
  });
}
