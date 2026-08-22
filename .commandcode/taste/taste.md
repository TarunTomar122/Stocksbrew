# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# copy
See [copy/taste.md](copy/taste.md)
# design
See [design/taste.md](design/taste.md)
# engineering
- Fix root causes instead of patching symptoms; avoid fallback chains that mask real issues. Confidence: 0.85
- Use Cerebras as the default LLM provider instead of OpenAI (cheaper, faster, acceptable quality). Confidence: 0.70
- During refactors, remove all dead code (unused props, consts, imports, content builders) and verify no orphaned helpers remain before calling it done. Confidence: 0.6

# workflow
See [workflow/taste.md](workflow/taste.md)
# communication
- User is casual and playful (lowercase, "hehe", smileys); match with a relaxed, direct tone. Confidence: 0.7
- User gives feedback as a rapid batch of visual nitpicks after seeing the build; acknowledge each item explicitly, fix them all, then continue to the next planned page without waiting for re-approval. Confidence: 0.75
- When reporting status or remaining todos, provide exhaustive detail — the user explicitly asked for "full detail, as much detail as you can" rather than summaries. Confidence: 0.7
