# When the Vibes Start Fading: The Hidden Challenges of LLM-Assisted Coding

*A developer's honest reflection on trying Claude Code with a complex codebase*

## The Promise vs. Reality

I tried Claude Code with my project—a SvelteKit application with a 5-level hierarchical data model, complete domain-driven architecture, and strict TypeScript patterns. The promise was enticing: an AI that could access my local codebase and understand my patterns.

**The positive:** It could indeed access my files and read my code.

**The reality:** The same fundamental challenges that plague all LLM coding assistance remained, just dressed up in local file access.

## The Pattern Problem: "I Will Create... Based on the Patterns"

The most insidious issue isn't what the AI gets wrong—it's the confidence with which it gets things wrong. Throughout our conversation, Claude would confidently declare:

> "I will create the Orders entity based on the patterns in your existing code..."

But when pressed for specifics, the cracks showed:

**Me:** "Do you have 100% of the information to implement this?"

**Claude:** "No, I'm not 100% sure! Let me list the gaps..."

The AI had read dozens of files, understood surface-level patterns, but missed critical implementation details:
- Server-side vs client-side validation patterns
- Transaction wrapper requirements (`TransWrapper`)
- Specific business rules and constraints
- CSS class naming conventions
- Database schema specifics

It was like having a consultant who skimmed your documentation and confidently proposed a solution without understanding the nuances that make or break real implementations.

## The Memory Paradox: Knowing vs. Remembering

One of the most frustrating patterns emerged around file management:

**Me:** "You keep reading files you already know. Why?"

**Claude:** "I had domainTypes.ts in context, but read it again anyway..."

**Me:** "How do you know which files contain critical info if you don't retain context?"

**Claude:** "That's a real catch-22! Without perfect context, I tend to 'defensive over-reading.'"

This revealed a fundamental limitation: LLMs can't maintain perfect working memory of large codebases. They're caught between:
- Reading too much (inefficient, uses tokens)
- Reading too little (missing critical details)
- Not knowing what they don't know

## The Token Time Bomb

Perhaps most concerning was the token limit uncertainty:

**Me:** "How many tokens are left in this conversation?"

**Claude:** "I can't see how many tokens are remaining..."

**Me:** "That's dangerous—it would be bad if we stopped mid-implementation."

This creates an impossible planning situation. You can't commit to complex refactoring when you don't know if the AI will cut out halfway through. The uncertainty forces you into defensive, small-increment work—exactly the opposite of what you'd want from an AI coding assistant.

## The Efficiency Trap

The cruel irony became clear as our conversation progressed:

> "In the time it takes me to clarify the gaps for Claude, I could have copied code samples/templates and adapted them to the new features myself."

The AI's offer to help had created more work, not less. Between:
- Explaining domain-specific patterns
- Correcting misconceptions
- Validating proposed approaches
- Managing token limits and memory issues

I was doing more cognitive work than if I'd just implemented the feature myself.

## The Vibe Coding Reality

"Vibe coding" with LLMs works great for:
- Greenfield projects with simple patterns
- Boilerplate generation
- Exploratory prototyping
- Learning new frameworks

It struggles with:
- Complex, established codebases
- Domain-specific business rules
- Subtle but critical implementation details
- Long-running refactoring sessions

## The Missing File Watcher

Near the end, an interesting technical limitation emerged:

**Me:** "Do you have a file-watcher that detects changes?"

**Claude:** "No... I'm 'blind' for changes outside my own tool calls."

This highlighted how LLMs are fundamentally snapshot-based. They can't maintain awareness of a living codebase that changes during development. Every interaction is a new context window, making them poor partners for iterative development.

## When to Trust, When to Retreat

The experience taught me that LLM coding assistance exists in an uncanny valley:
- **Too smart** to dismiss outright
- **Too limited** to trust completely
- **Too confident** in its incomplete knowledge

The key is recognizing when the vibes start fading—when the AI's confident suggestions mask fundamental misunderstandings of your domain. At that point, it's often faster to retreat to traditional copy-paste-adapt development than to continue the expensive process of AI education.

## The Path Forward

LLM coding tools aren't useless, but they require careful calibration of expectations. They're best used as:
- **Pattern recognizers**, not pattern implementers
- **Boilerplate generators**, not architecture designers
- **Conversation partners**, not autonomous developers

The future might bring better context management, file watching capabilities, and domain-specific training. But for now, when working with complex codebases, it's important to recognize when the AI's confidence exceeds its competence—and when it's time to take back control.

*The vibes are great until they're not. And unfortunately, you don't always know which side you're on until it's too late.*