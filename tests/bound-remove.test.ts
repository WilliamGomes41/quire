import { afterEach, describe, expect, it } from "vitest";
import { createIssue } from "../src/lib/bind";
import { resetMemoryDb } from "../src/lib/db";
import { saveClip } from "../src/lib/save";
import {
  clipStore,
  deleteBoundIssue,
  issueStore,
  listClips,
  listIssues,
  returnPiecesToDesk,
  takeBoundOffDesk,
} from "../src/lib/store";
import type { ArticleWords } from "../src/lib/article";

const quietHeadline = async () => ({ text: "" });

const originalWords: ArticleWords = {
  url: "https://example.com/kept",
  headline: "The harbour vote",
  paragraphs: ["The assembly met at dusk in Praia."],
};

async function keepAndBind(url = "https://example.com/kept") {
  const clips = await clipStore();
  const clip = await saveClip({ url }, clips, {
    readHeadline: quietHeadline,
    understand: async () => {
      throw new Error("model down");
    },
    searchPages: async () => [],
  });
  const issue = await createIssue({ clip }, await issueStore(), {
    fetchWords: async () => ({ ...originalWords, url: clip.url }),
    writeTake: async () => {
      throw new Error("take down");
    },
  });
  await takeBoundOffDesk(issue.pieces.map((piece) => piece.url));
  return { clip, issue };
}

describe("bound issue Remove and Desk", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
    delete process.env.SEARCH_API_KEY;
  });

  it("allows an empty issue list", async () => {
    expect(await listIssues()).toEqual([]);
    const { issue } = await keepAndBind("https://example.com/empty-list");
    expect((await listIssues()).map((row) => row.id)).toEqual([issue.id]);
    await deleteBoundIssue(issue.id, "discard");
    expect(await listIssues()).toEqual([]);
    await expect(deleteBoundIssue(issue.id, "discard")).resolves.toBeUndefined();
    await expect(deleteBoundIssue("", "return")).resolves.toBeUndefined();
    expect(await listIssues()).toEqual([]);
  });

  it("keeps a bound clip off Desk until it is returned", async () => {
    const { clip, issue } = await keepAndBind("https://example.com/off-desk");
    expect(await (await clipStore()).get(clip.id)).toBeNull();
    expect((await listClips()).map((row) => row.url)).not.toContain(clip.url);

    await deleteBoundIssue(issue.id, "return");
    const returned = await listClips();
    expect(returned.map((row) => row.url)).toContain(clip.url);
    expect(returned[0]?.sourceHeadline).toMatchObject({
      status: "ok",
      text: "The harbour vote",
    });
    expect(await listIssues()).toEqual([]);

    const onDesk = returned.find((row) => row.url === clip.url);
    expect(onDesk).toBeTruthy();
    const rebound = await createIssue({ clip: onDesk! }, await issueStore(), {
      fetchWords: async () => ({ ...originalWords, url: clip.url }),
      writeTake: async () => {
        throw new Error("take down");
      },
    });
    await takeBoundOffDesk(rebound.pieces.map((piece) => piece.url));
    expect((await listClips()).map((row) => row.url)).not.toContain(clip.url);
    expect((await listIssues()).map((row) => row.id)).toEqual([rebound.id]);
  });

  it("returns pieces to Desk on one delete path", async () => {
    const { clip, issue } = await keepAndBind("https://example.com/return-path");
    expect((await listClips()).length).toBe(0);
    await deleteBoundIssue(issue.id, "return");
    expect((await listClips()).map((row) => row.url)).toEqual([clip.url]);
    expect(await (await issueStore()).get(issue.id)).toBeNull();
  });

  it("removes the pieces too on the other delete path", async () => {
    const { clip, issue } = await keepAndBind("https://example.com/discard-path");
    await deleteBoundIssue(issue.id, "discard");
    expect(await listClips()).toEqual([]);
    expect((await listClips()).map((row) => row.url)).not.toContain(clip.url);
    expect(await (await issueStore()).get(issue.id)).toBeNull();
    expect(await listIssues()).toEqual([]);
  });

  it("does not duplicate a piece already on Desk when returning", async () => {
    const { clip, issue } = await keepAndBind("https://example.com/no-dup");
    await returnPiecesToDesk(issue.pieces);
    await returnPiecesToDesk(issue.pieces);
    const listed = (await listClips()).filter((row) => row.url === clip.url);
    expect(listed).toHaveLength(1);
    await deleteBoundIssue(issue.id, "return");
    expect((await listClips()).filter((row) => row.url === clip.url)).toHaveLength(1);
  });

  it("leaves the clip on Desk when bind cannot fetch the words", async () => {
    const clips = await clipStore();
    const clip = await saveClip({ url: "https://example.com/failed-bind" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: async () => [],
    });
    await expect(
      createIssue({ clip }, await issueStore(), {
        fetchWords: async () => {
          throw new Error("fetch down");
        },
      }),
    ).rejects.toThrow(/author's words/);
    expect(await clips.get(clip.id)).toMatchObject({ url: clip.url });
    expect(await listIssues()).toEqual([]);
  });
});
