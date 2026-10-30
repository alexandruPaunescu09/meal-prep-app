import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ClaudeError } from "@/lib/ai/claude";
import { extractRecipeFromUrl } from "@/lib/recipes/import";
import { mapRecipe, type RecipeImageFile, type RecipeMapInput } from "@/lib/recipes/import/map";
import { findDuplicateByName } from "@/lib/recipes/import/postprocess";
import { fetchFailureResponse, validateJsonBody, validateUploads } from "@/lib/recipes/import/request";
import type { RecipeImportResponse, RecipeImportSource } from "@/lib/recipes/import/types";

export const maxDuration = 120;

// STATELESS: reads only; nothing is written to the DB or storage here.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  // 1. Input -> model input + source.
  let input: RecipeMapInput;
  let source: RecipeImportSource;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
    const problem = validateUploads(uploads);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const files: RecipeImageFile[] = await Promise.all(
      uploads.map(async (f) => ({
        name: f.name,
        mediaType: f.type as RecipeImageFile["mediaType"],
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
      })),
    );
    input = { kind: "images", files };
    source = { kind: "images" };
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsedBody = validateJsonBody(body);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });

    if (parsedBody.kind === "text") {
      input = { kind: "text", text: parsedBody.text };
      source = { kind: "text" };
    } else {
      const page = await extractRecipeFromUrl(parsedBody.url);
      if (!page.ok) {
        const f = fetchFailureResponse(page.reason);
        return NextResponse.json({ error: f.error, reason: page.reason }, { status: f.status });
      }
      if (page.source === "json-ld") {
        input = { kind: "json-ld", recipe: page.recipe };
        source = { kind: "url", url: page.finalUrl, siteName: page.recipe.siteName };
      } else {
        if (page.text.trim().length < 20) {
          return NextResponse.json(
            {
              error:
                "No recipe could be read from that page. Paste the recipe text or upload screenshots instead.",
            },
            { status: 422 },
          );
        }
        input = { kind: "page-text", title: page.title, text: page.text };
        source = { kind: "url", url: page.finalUrl };
      }
    }
  }

  // 2. Catalog (reads only).
  const [ingRes, aliasRes, catRes, recipeRes] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("ingredient_aliases").select("ingredient_id, store, alias"),
    supabase.from("ingredient_categories").select("slug, name").order("sort_order"),
    supabase.from("recipes").select("id, name"),
  ]);
  if (ingRes.error || aliasRes.error || catRes.error || recipeRes.error) {
    return NextResponse.json({ error: "Failed to load the ingredient catalog" }, { status: 500 });
  }

  // 3. Claude mapping.
  let result;
  try {
    result = await mapRecipe({
      input,
      ingredients: ingRes.data ?? [],
      aliases: aliasRes.data ?? [],
      categories: catRes.data ?? [],
    });
  } catch (e) {
    if (e instanceof ClaudeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("recipe import parse failed", e);
    return NextResponse.json({ error: "Failed to parse the recipe" }, { status: 500 });
  }

  if (result.lines.length === 0 && !result.recipe.name) {
    return NextResponse.json({ error: "No recipe was found in that input." }, { status: 422 });
  }

  const response: RecipeImportResponse = {
    draft: {
      source,
      recipe: result.recipe,
      lines: result.lines,
      duplicateOf: findDuplicateByName(result.recipe.name, recipeRes.data ?? []),
    },
    model: result.model,
  };
  return NextResponse.json(response);
}
