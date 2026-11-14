/**
 * Page routes: the Inertia app-shell pages (/, /admin).
 * Feature pages get their own `<feature>.routes.ts` — see AGENTS.md
 * "Route conventions".
 *
 * `/` has no page of its own: it redirects to `/visits` (the main
 * dashboard page) when authenticated, or `/login` otherwise. Not
 * CDN-cacheable — the redirect target depends on session state.
 */
import { Hono } from "hono";
import { config } from "../configs";
import { requireRole } from "../services/auth";
import { safeUrl } from "../middlewares/url";
import { countUsers, listUsers, toPublicUser } from "../../server/repo/user";
import type { AppEnv } from "../middlewares/inertia-middleware";
import type { Paginated, User } from "../../shared/types";

export const pageRoutes = () => {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const path = c.var.user ? "/visits" : "/login";
    const url = safeUrl(c.req.raw.url);
    url.protocol = safeUrl(config.appUrl).protocol;
    return Response.redirect(new URL(path, url.toString()).toString());
  });

  app.get("/admin", requireRole("admin"), (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, Number(c.req.query("perPage") ?? 10) || 10),
    );
    const total = countUsers.get()?.n ?? 0;
    const users: Paginated<User> = {
      data: listUsers.all(perPage, (page - 1) * perPage).map(toPublicUser),
      meta: {
        currentPage: page,
        perPage,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
        total,
      },
    };
    return c.var.inertia.render("Admin", { users });
  });

  return app;
};
