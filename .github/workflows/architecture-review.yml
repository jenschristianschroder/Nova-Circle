# ──────────────────────────────────────────────────────────────────────────
# Daily Architecture & Design Principles Review
#
# Runs every morning at 03:00 UTC. Reads the codebase and the project's
# copilot-instructions.md (solution strategy + design principles), asks an
# LLM to identify violations, and creates one GitHub issue per finding.
#
# Prerequisites:
#   1. A GitHub fine-grained PAT or App token stored as REVIEW_TOKEN with
#      "issues: write" and "contents: read" permissions.
#   2. An Azure OpenAI deployment -OR- a GitHub Models / OpenAI API key
#      stored as LLM_API_KEY.
#   3. Set LLM_ENDPOINT and LLM_MODEL as repository variables or adjust
#      the defaults below.
# ──────────────────────────────────────────────────────────────────────────

name: Daily Architecture Review

on:
  schedule:
    - cron: '0 3 * * *'    # Every day at 03:00 UTC
  workflow_dispatch:         # Allow manual trigger for testing

permissions:
  contents: read
  issues: write

env:
  # ── LLM configuration ──────────────────────────────────────────────────
  # Option A: Azure OpenAI
  #   LLM_ENDPOINT: https://<your-resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-08-01-preview
  # Option B: GitHub Models (https://models.github.com)
  #   LLM_ENDPOINT: https://models.inference.ai.azure.com/chat/completions
  # Option C: OpenAI direct
  #   LLM_ENDPOINT: https://api.openai.com/v1/chat/completions
  LLM_ENDPOINT: ${{ vars.LLM_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions' }}
  LLM_MODEL: ${{ vars.LLM_MODEL || 'gpt-4o' }}
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }}

  # ── Review configuration ────────────────────────────────────────────────
  MAX_ISSUES: '10'          # Cap issues created per run to avoid noise

jobs:
  review:
    name: Architecture review
    runs-on: ubuntu-latest
    steps:
      # ── 1. Checkout ────────────────────────────────────────────────────
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      # ── 2. Collect codebase snapshot for review ────────────────────────
      - name: Build codebase snapshot
        id: snapshot
        run: |
          set -euo pipefail

          # Collect the design principles document
          PRINCIPLES=""
          if [ -f ".github/copilot-instructions.md" ]; then
            PRINCIPLES=$(cat .github/copilot-instructions.md)
          fi

          # Collect all TypeScript source files (skip node_modules, dist, test files)
          # Truncate very large files to keep within token limits
          MAX_FILE_CHARS=3000
          SNAPSHOT=""
          FILE_COUNT=0

          while IFS= read -r -d '' file; do
            FILE_COUNT=$((FILE_COUNT + 1))
            CONTENT=$(head -c $MAX_FILE_CHARS "$file")
            SNAPSHOT="${SNAPSHOT}

          --- FILE: ${file} ---
          ${CONTENT}"
          done < <(find src/ -name '*.ts' -not -name '*.test.ts' -not -name '*.spec.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 | sort -z)

          echo "Collected ${FILE_COUNT} source files for review"

          # Also collect migration files
          if [ -d "db/migrations" ]; then
            while IFS= read -r -d '' file; do
              CONTENT=$(head -c $MAX_FILE_CHARS "$file")
              SNAPSHOT="${SNAPSHOT}

          --- FILE: ${file} ---
          ${CONTENT}"
            done < <(find db/migrations/ -name '*.ts' -print0 | sort -z)
          fi

          # Write to temp files (avoid shell escaping issues)
          echo "$PRINCIPLES" > /tmp/principles.txt
          echo "$SNAPSHOT" > /tmp/snapshot.txt

      # ── 3. Call LLM to review against design principles ────────────────
      - name: Run LLM architecture review
        id: llm_review
        run: |
          set -euo pipefail

          PRINCIPLES=$(cat /tmp/principles.txt)
          SNAPSHOT=$(cat /tmp/snapshot.txt)

          # Build the prompt
          cat > /tmp/prompt.json << 'PROMPT_EOF'
          {
            "model": "${{ env.LLM_MODEL }}",
            "temperature": 0.2,
            "max_tokens": 4000,
            "messages": [
              {
                "role": "system",
                "content": "You are a senior software architect reviewing a TypeScript codebase against its documented solution strategy and design principles.\n\nYour job:\n1. Read the DESIGN PRINCIPLES document carefully.\n2. Read the CODEBASE SNAPSHOT.\n3. Identify concrete, specific violations of the design principles.\n4. For each finding, provide:\n   - A short title (max 80 chars)\n   - The file path where the violation occurs\n   - A clear description of what violates the principle and why\n   - Which specific principle or rule from the document is violated\n   - A suggested fix\n\nRules:\n- Only report genuine, specific violations you can point to in the code.\n- Do NOT report missing features or unimplemented modules — only violations in existing code.\n- Do NOT report test files.\n- Do NOT fabricate findings. If the code is compliant, say so.\n- Be precise about file paths and line-level issues.\n- Maximum 10 findings, ordered by severity (most critical first).\n\nOutput format: Return a JSON array of findings. Each finding is an object with keys: title, file, description, principle_violated, suggested_fix, severity (critical|high|medium|low).\nIf no violations found, return an empty array: []\nReturn ONLY the JSON array, no markdown fences, no extra text."
              },
              {
                "role": "user",
                "content": "PLACEHOLDER_CONTENT"
              }
            ]
          }
          PROMPT_EOF

          # Combine principles + snapshot into user message
          USER_CONTENT="## DESIGN PRINCIPLES\n\n${PRINCIPLES}\n\n## CODEBASE SNAPSHOT\n\n${SNAPSHOT}"

          # Use Python to safely build the JSON (handles escaping)
          python3 << 'PYEOF'
          import json, os

          with open('/tmp/principles.txt', 'r') as f:
              principles = f.read()
          with open('/tmp/snapshot.txt', 'r') as f:
              snapshot = f.read()

          # Truncate if needed to stay within ~120k chars total
          max_snapshot = 100000
          if len(snapshot) > max_snapshot:
              snapshot = snapshot[:max_snapshot] + "\n\n[TRUNCATED — snapshot too large]"

          user_content = f"## DESIGN PRINCIPLES\n\n{principles}\n\n## CODEBASE SNAPSHOT\n\n{snapshot}"

          payload = {
              "model": os.environ["LLM_MODEL"],
              "temperature": 0.2,
              "max_tokens": 4000,
              "messages": [
                  {
                      "role": "system",
                      "content": (
                          "You are a senior software architect reviewing a TypeScript codebase "
                          "against its documented solution strategy and design principles.\n\n"
                          "Your job:\n"
                          "1. Read the DESIGN PRINCIPLES document carefully.\n"
                          "2. Read the CODEBASE SNAPSHOT.\n"
                          "3. Identify concrete, specific violations of the design principles.\n"
                          "4. For each finding, provide:\n"
                          "   - A short title (max 80 chars)\n"
                          "   - The file path where the violation occurs\n"
                          "   - A clear description of what violates the principle and why\n"
                          "   - Which specific principle or rule from the document is violated\n"
                          "   - A suggested fix\n\n"
                          "Rules:\n"
                          "- Only report genuine, specific violations you can point to in the code.\n"
                          "- Do NOT report missing features or unimplemented modules — only violations in existing code.\n"
                          "- Do NOT report test files.\n"
                          "- Do NOT fabricate findings. If the code is compliant, say so.\n"
                          "- Be precise about file paths and line-level issues.\n"
                          "- Maximum 10 findings, ordered by severity (most critical first).\n\n"
                          "Output format: Return a JSON array of findings. Each finding is an object with keys: "
                          "title, file, description, principle_violated, suggested_fix, severity "
                          "(critical|high|medium|low).\n"
                          "If no violations found, return an empty array: []\n"
                          "Return ONLY the JSON array, no markdown fences, no extra text."
                      )
                  },
                  {
                      "role": "user",
                      "content": user_content
                  }
              ]
          }

          with open('/tmp/request.json', 'w') as f:
              json.dump(payload, f)
          PYEOF

          # Call the LLM
          HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/llm_response.json \
            -X POST "${{ env.LLM_ENDPOINT }}" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ env.LLM_API_KEY }}" \
            -H "api-key: ${{ env.LLM_API_KEY }}" \
            -d @/tmp/request.json)

          if [ "$HTTP_CODE" -ne 200 ]; then
            echo "::error::LLM API returned HTTP $HTTP_CODE"
            cat /tmp/llm_response.json
            exit 1
          fi

          # Extract the content from the response
          python3 << 'PYEOF2'
          import json, sys

          with open('/tmp/llm_response.json', 'r') as f:
              resp = json.load(f)

          content = resp.get("choices", [{}])[0].get("message", {}).get("content", "[]")

          # Strip markdown fences if present
          content = content.strip()
          if content.startswith("```"):
              lines = content.split("\n")
              content = "\n".join(lines[1:])
          if content.endswith("```"):
              content = content[:-3].strip()

          # Validate it's valid JSON
          try:
              findings = json.loads(content)
              if not isinstance(findings, list):
                  findings = []
          except json.JSONDecodeError:
              print(f"::warning::LLM returned non-JSON content: {content[:200]}")
              findings = []

          with open('/tmp/findings.json', 'w') as f:
              json.dump(findings, f, indent=2)

          print(f"Found {len(findings)} architecture review findings")
          PYEOF2

      # ── 4. Create GitHub issues for findings ───────────────────────────
      - name: Create issues for findings
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const findings = JSON.parse(fs.readFileSync('/tmp/findings.json', 'utf8'));
            const maxIssues = parseInt(process.env.MAX_ISSUES || '10');
            const today = new Date().toISOString().split('T')[0];

            if (findings.length === 0) {
              console.log('✅ No architecture violations found. Codebase is compliant.');
              return;
            }

            // Check for existing open issues to avoid duplicates
            const existingIssues = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'architecture-review',
              per_page: 100,
            });

            const existingTitles = new Set(
              existingIssues.data.map(i => i.title.toLowerCase())
            );

            let created = 0;

            for (const finding of findings.slice(0, maxIssues)) {
              // Skip if a similar issue already exists
              const proposedTitle = `[arch-review] ${finding.title}`;
              if (existingTitles.has(proposedTitle.toLowerCase())) {
                console.log(`⏭️  Skipping duplicate: ${proposedTitle}`);
                continue;
              }

              const severityEmoji = {
                critical: '🔴',
                high: '🟠',
                medium: '🟡',
                low: '🔵',
              }[finding.severity] || '⚪';

              const body = [
                `## ${severityEmoji} Architecture Review Finding`,
                '',
                `**Severity:** ${finding.severity}`,
                `**File:** \`${finding.file}\``,
                `**Review date:** ${today}`,
                '',
                '### Description',
                finding.description,
                '',
                '### Principle Violated',
                `> ${finding.principle_violated}`,
                '',
                '### Suggested Fix',
                finding.suggested_fix,
                '',
                '---',
                '*This issue was automatically created by the daily architecture review workflow.*',
                '*Source: `.github/copilot-instructions.md` design principles.*',
              ].join('\n');

              try {
                const issue = await github.rest.issues.create({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  title: proposedTitle,
                  body: body,
                  labels: [
                    'architecture-review',
                    `severity:${finding.severity}`,
                    'automated',
                  ],
                });
                console.log(`✅ Created issue #${issue.data.number}: ${proposedTitle}`);
                created++;
              } catch (err) {
                console.log(`::warning::Failed to create issue: ${err.message}`);
              }
            }

            console.log(`\n📊 Summary: ${created} issues created, ${findings.length - created} skipped (duplicates or errors)`);

      # ── 5. Summary ─────────────────────────────────────────────────────
      - name: Post summary
        if: always()
        run: |
          if [ -f /tmp/findings.json ]; then
            COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/findings.json'))))")
            echo "### 🏗️ Architecture Review Complete" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "- **Findings:** ${COUNT}" >> $GITHUB_STEP_SUMMARY
            echo "- **Max issues per run:** ${{ env.MAX_ISSUES }}" >> $GITHUB_STEP_SUMMARY
            echo "- **Review date:** $(date -u +%Y-%m-%d)" >> $GITHUB_STEP_SUMMARY
          else
            echo "### ⚠️ Architecture Review" >> $GITHUB_STEP_SUMMARY
            echo "Review did not complete successfully." >> $GITHUB_STEP_SUMMARY
          fi
