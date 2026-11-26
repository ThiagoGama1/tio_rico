// Endpoints internos do Auth.js (callback do link de e-mail, CSRF, sessão,
// signout). O front usa as rotas em /api/session; estas ficam para o Auth.js.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
