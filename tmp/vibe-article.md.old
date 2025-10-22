### Systemic Limits of AI Code Assistants in Complex Projects

**Abstract**

AI coding assistants promise faster delivery and less boilerplate. In real projects, however, the limits show up as soon as the work goes beyond trivial edits. This analysis sets out the terms, the mechanics of how assistants see code, and the consequences that follow—without anecdotes, hype, or padding. <br>
ths article refers to the following AI tools respectively assistants:

* General LLM tools
  * Chat GPT 5
  * Claude Sonnet 4.15 and Opus 4.1
  * Gemini 2.5 pro
* Vibe Coding Tools
  * Claude Code with VSC integration
  * JetBrains AI assiatant in Webstorm and Rider
  * Github CoPilot iwht VSC integration

The software projects I used them with:
* A svelte/kit based web application with about 50k lines of code.
* A Pyhton application for optimzing a workforce schedule.
* A C# application implementing a beam seach heuristic for optimzing a workforce schedule.


#### 1. Fundamental Concepts

To analyze the behavior of AI assistants, we must first define the operational mechanics.

*   **Session:** A continuous interaction in which an assistant receives files and messages and produces answers or code.
*   **Context Window:** The maximum "memory" (e.g. tokens in a LLM) the model can hold at one time; while material fits, nothing is removed. Once additions would exceed that limit, earlier details cannot remain fully available in active memory.
*   **Complete-Bundle:** The assistant is given the entire code bundle at the outset and thus starts with a unified view of the project. This is kind of the "optimal" scenario, it the context window is big enough. The AI keeps everything in its "memory" without needing to reload files or parts of files.
*   **Vibe Coding:** The AI assitant acts a pair-programming buddy. Material (code fragments) arrives incrementally; the assistant constructs its picture of the system as the conversation touches different areas. It never truly holds the entire system in memory at once.
*   **Retrieval/Search:** The auxiliary mechanisms an assistant uses to locate and load code by filename, token, or textual pattern—into the session.

#### 2. Probabilistic Generation vs. Deterministic Systems

A central "feature" of AI assistants is that they generate by **probabilistic continuation rather than by proof.** They reproduce "local" naming and style, but correctness depends on systemic constraints that may not be represented in the active context. This leads to characteristic failures, for example:

*   **Reasonable looking but wrong code:** It generates code that looks reasonable but does not even compile. Suggested code references configuration parameters that do not exist or calls functions the project never defined. Because the presentation is uniformly confident, plausibility is easy to mistake for reliability, and every suggestion requires careful review even when it appears routine.
*   **Software Design Context Mimatch:** It mixes up different contextes form different layers of an application. It suggests, for instance, to use data access functions in the frontend layer, just because they seem plausible based on their declaration and description.

This demonstrates a core principle: **Availability of text is not equivalent to understanding of applicability.**

#### 3. The Context Window Challenge

The context window is a hard size limit that exacerbates the core probabilistic weakness. It is critical to understand that even in the ideal scenario of a complete-bundle that fits the context window, the system remains fundamentally probabilistic; having all the information is not the same as applying it correctly. This represents the *best-case* reliability. All other variations where the full context is not available—due to truncation, summarization, or on-demand loading—can only become worse than that.

The practical effects of this limitation manifest differently across tool architectures:

*   **In-editor assistants, "Vibe-Coding"**, are an example of transient context. They operate based on open files and effectively "forget" a file's content moments after it is closed (<this ist not true. Parts stay in the context window. => Improve this to be more accurate: When do they forget? By which algorithm? Or generally?>). Their suggestions are a series of isolated text hits rather than architecturally-aware contributions.
*   More advanced, **retrieval-augmented assistants** attempt to solve this by using so called "embeddings" for whole-codebase awareness. This shifts the problem rather than solving it. Embeddings are a form of lossy compression; they are excellent for finding semantically *similar* code but do not represent the *exact, logical* architecture. The Documentation Paradox is particularly acute here: detailed prose in an `ARCHITECTURE.md` file is converted into a vector that loses its specific, nuanced constraints. The knowledge degradation is more subtle, but it persists.

At this point, the assistant pivots toward project-wide pattern search—internal lookups akin to a powerful `grep`. <Improve that? What does that mean? At this point? Which point? In general or related to our story?> It can still surface definitions and strings quickly, but the relationships between files fade. Reasoning drifts from a coherent architectural view to working off isolated text hits, which in turn encourages **repeated searching of ground that was already covered.**

This leads to the **Documentation Paradox**: Good documentation helps initially, because the assistant can quote structure and rationale. As the session grows, detailed passages are the first to be displaced from active memory or condensed into summaries. The assistant’s tone remains uniformly confident while critical specifics have already slipped out of view. Attempts to recover richness by re-reading the same documents consume capacity without restoring the original architectural continuity.

#### 4. Practical Consequences and Risks

This combination of probabilistic reasoning and bounded memory creates tangible risks and workflow inefficiencies.

##### 4.2 Planning Under Uncertainty
Most assistants do not disclose remaining capacity. Teams cannot tell when a session is close to the limit, and long, cross-file changes become difficult to stage. Hidden token ceilings can end a conversation abruptly, introducing operational risk and a practical form of lock-in: a central tool in the workflow may stop at an unspecified boundary, regardless of project urgency.

#### 4.2a Paying for... what exactly?
This lock-in is fundamentally stronger and more severe than with traditional tools. An IDE is typically licensed by version or features, granting unlimited usage once paid for. AI assistants, however, are metered by token consumption. This introduces not just a conversational token ceiling, but a "subscription ceiling"—a hard limit on daily or monthly usage. Hitting this limit can disable a core development tool entirely, creating an unprecedented operational dependency. A team's productivity is no longer determined by its skill, but by its consumption meter, leaving it completely at the mercy of the provider's billing model. 

##### 4.3 Efficiency in Day-to-Day Work
The promise of speed often gives way to coordination overhead. This is made explicit in **assistants with manual context management**, where the developer is responsible for constantly curating the set of files the tool can see. The developer effectively becomes the memory manager for the AI. In all cases, developers re-supply files the assistant has aged out of memory, restate rules the assistant has partially forgotten, and verify output that looked correct but fails basic checks. **The cumulative cost—clarifying patterns, correcting assumptions, and re-running reviews—frequently approaches or exceeds the effort required to implement the change directly.**

##### 4.4 The Workflow Mismatch
Modern development is iterative and stateful. Teams make cross-file edits, run tests and builds continuously, and debug against live state. Assistants operate on session snapshots with limited persistence across conversations, modest awareness of file-system events, and weak integration with test and build pipelines. This mismatch makes long-running refactors and architecture-level changes brittle, because the assistant cannot reliably carry the evolving state forward.

##### 4.1 Security Implications
Probabilistic generation introduces security risk. Because every snippet is presented with steady confidence, subtle flaws are easy to miss.
*   Assistants can suggest unparameterized queries that invite **injection**.
*   They can overlook input validation that prevents **cross-site scripting**.
*   They may assemble fragile **authentication flows**.
*   Training data can also encode **insecure patterns**.

As a result, AI-generated changes should be treated like contributions from an unknown external source: subject to rigorous code review and backed by deterministic scanning with tools such as CodeQL, SonarQube, or Veracode.

#### 5. Strategic Application and Boundaries

Effective use requires deliberately keeping the tools within predictable lanes.

##### 5.1 What Today’s Assistants Lack
Dependable work on large systems requires **persistent memory across sessions, retrieval that preserves architectural relationships** rather than only matching tokens, **transparent indicators of remaining headroom**, and proper **integration with development tooling** so suggestions can be grounded in executable state. Without these, assistants remain closer to fast pattern matchers than to colleagues who hold a system steadily in mind.

##### 5.2 Appropriate Use Cases
*   Generating conventional scaffolding.
*   Translating or explaining unfamiliar code.
*   Exploring new libraries.
*   Supporting greenfield projects that follow clear, standard patterns.

##### 5.3 High-Risk Boundaries
*   Established codebases with domain-specific conventions.
*   Cross-component refactors that need sustained context.
*   Architectural decisions with cross-cutting constraints.
*   Performance work that demands system-wide insight.

##### 5.4 Recognizing When to Stop
Certain signals indicate that continuing will cost more than it saves: references to undefined parameters or functions, code that does not compile, stylistic alignment that conflicts with domain rules, repeated re-searching of material already seen, many iterations to correct code errors, and review time rising to match implementation time. At that point, pausing the assistant, narrowing scope, or proceeding manually is usually the rational choice.

#### 6. Architecting a More Reliable Future: Paths Beyond Probabilism

The limitations of current tools stem from a reliance on a probabilistic paradigm. A truly robust assistant would require a shift towards systems grounded in deterministic logic. This involves two distinct layers of understanding, which can then be combined into a powerful hybrid system.

##### 6.1 The Deterministic Foundation: A Layered Approach

This path aims to replace statistical plausibility with verifiable proof by building upon two layers of deterministic analysis.

**6.1.1 Layer 1: Structural Correctness (Abtract Syntax Tree & Language Server)**
The foundation for deterministic analysis already exists in every modern IDE: the **Language Server**. It continuously parses code into an **Abstract Syntax Tree (AST)**, creating a perfect, structured "ground truth" model of the entire codebase. This is a context graph that understands:
*   The exact definition of every function and variable.
*   The complete call hierarchy (who calls whom).
*   The full type and inheritance structure.

An assistant using this layer would have **deterministic structural knowledge**. It could never hallucinate a function that doesn't exist, because it would be checking against the definitive "map" of the AST, not guessing based on text patterns. However, this layer only understands the *structure* of the code, not its intended *meaning* or architectural rules. It will happily let you write syntactically perfect but architecturally flawed code.

**6.1.2 Layer 2: Logical Correctness (Automated Reasoning)**
This is the next layer of analysis, built **on top of** the structural model provided by the AST. Automated Reasoning (AR) applies **formal logic** to this structured representation to prove higher-level properties. The codebase is treated as a formal system with:
*   **Axioms:** Facts derived from the AST (e.g., "Class `UserService` is in the 'Service' layer").
*   **Rules:** User-defined architectural constraints (e.g., "A function in the 'Service' layer must not call a function in the 'Database' layer").

An AR engine can then formally **prove** whether a piece of code adheres to these rules. It moves beyond "is this code syntactically valid?" to "is this code **logically valid** according to the system's architecture?"

##### 6.2 The Hybrid System: Synthesizing All Layers

This is the most promising and practical path forward. It doesn't seek to replace the LLM, but to constrain it by combining its generative strengths with the deterministic validation of both layers.

The workflow would be a **"Generate-then-Validate"** loop:

1.  **The LLM as the "Creative Proposer":** The developer interacts with the LLM in natural language. The LLM generates a plausible code suggestion.
2.  **The Deterministic Validator:** Before the suggestion is shown, it undergoes a two-stage internal check:
    *   **Layer 1 Check:** Does the generated code parse and fit into the existing **AST**? Do all types match and do all functions exist? If not, reject.
    *   **Layer 2 Check:** If the structure is valid, does this change violate any of the formal architectural rules defined in the **AR engine**? If so, reject.
3.  **The Result:** Only suggestions that pass both the structural and logical checks are presented to the developer.

##### 6.3 Why These Approaches Are Not Yet Standard

If this hybrid system is so superior, why do current tools still rely on unreliable text retrieval?

1.  **Latency:** The "Validate" step, especially the AR part, is computationally expensive. Today's tools are optimized for the "magic" of sub-second text completion. A reliable but slower suggestion is often perceived as a worse user experience.
2.  **The "Messy State" Problem:** This is the biggest hurdle. An AST requires syntactically correct code. Developers, however, spend most of their time writing code that is temporarily broken. A robust validator must be incredibly sophisticated to handle these partial, invalid states, which is a massive engineering challenge.
3.  **Formalization Overhead:** Implementing Automated Reasoning (Layer 2) requires developers to formally define their architectural rules in a machine-readable language. Most projects do not have this level of formal specification.

The current approach is a pragmatic compromise: it sacrifices reliability for speed and the ability to function in a messy, informal environment.

#### 7. Conclusion

Whether an assistant begins with a **Complete-Bundle** snapshot or constructs its view through **Vibe Coding**, two fundamentals govern outcomes: **bounded context** and **probabilistic generation**. The first constrains how much detail can be carried forward; the second makes superficially correct code easy to produce and easy to trust. Complete-Bundle offers the best start and still cannot guarantee correct application of project-specific rules. Vibe Coding scales to large codebases but tends toward project-wide pattern search once the window is pressured, trading architectural coherence for fast text matches.

Used deliberately—with static analysis, rigorous review, and realistic scope—assistants remain useful for exploration, explanation, and routine code. Expecting them to handle domain logic, sustained multi-file changes, or security-critical work reliably is where the vibes fade. A future grounded in the hybrid architecture of probabilistic generation checked by deterministic validation may finally overcome these limits, but today's tools require careful, critical application.

