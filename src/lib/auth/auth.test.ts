import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isProtectedPath, safeNextPath } from "./paths";
import { signInSchema, signUpSchema } from "./schemas";

describe("safeNextPath (evita redirecciones abiertas)", () => {
  it("acepta rutas internas con consulta", () => {
    expect(safeNextPath("/diario")).toBe("/diario");
    expect(safeNextPath("/ajustes/seguridad?tab=1")).toBe("/ajustes/seguridad?tab=1");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "diario",
    "",
    undefined,
    null,
    `/${"a".repeat(600)}`,
  ])("rechaza %s", (value) => {
    expect(safeNextPath(value as string | undefined)).toBe("/diario");
  });

  it("usa el valor por defecto indicado", () => {
    expect(safeNextPath("//x", "/login")).toBe("/login");
  });
});

describe("rutas protegidas", () => {
  it("protege el diario y los ajustes, no rutas parecidas", () => {
    expect(isProtectedPath("/diario")).toBe(true);
    expect(isProtectedPath("/diario/entrada/1")).toBe(true);
    expect(isProtectedPath("/ajustes")).toBe(true);
    expect(isProtectedPath("/diarios")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isGuestOnlyPath("/registro")).toBe(true);
    expect(isGuestOnlyPath("/nueva-contrasena")).toBe(false);
  });
});

describe("esquemas de autenticación", () => {
  const valid = {
    email: "  Ana@Example.TEST ",
    password: "una contraseña larga",
    passwordConfirm: "una contraseña larga",
  };

  it("normaliza el correo", () => {
    expect(signUpSchema.parse(valid).email).toBe("ana@example.test");
  });

  it("exige 12 caracteres y que coincidan", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "corta", passwordConfirm: "corta" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, passwordConfirm: "otra contraseña larga" }).success).toBe(false);
  });

  it("rechaza contraseñas de más de 72 bytes (límite de bcrypt)", () => {
    const long = "ñ".repeat(37); // 74 bytes en UTF-8
    expect(signUpSchema.safeParse({ ...valid, password: long, passwordConfirm: long }).success).toBe(false);
  });

  it("en el login no aplica la longitud mínima, solo exige algo", () => {
    expect(signInSchema.safeParse({ email: "a@b.es", password: "corta" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.es", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "no-es-correo", password: "x" }).success).toBe(false);
  });
});
