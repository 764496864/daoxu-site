---
name: elite-frontend-ux
description: Create distinctive, production-grade frontend interfaces with expert-level UX design. Combines bold aesthetic direction with systematic design tokens, WCAG accessibility, conversion optimization, and best practices. Produces polished, memorable interfaces that avoid generic AI aesthetics.
source: https://gist.github.com/majidmanzarpour/8b95e5e0e78d7eeacd3ee54606c7acc6
---

# Elite Frontend UX Design Skill

Create distinctive, production-grade interfaces that combine bold aesthetics with systematic UX excellence. Every output must be visually striking AND functionally flawless.

## 1. Design Philosophy

Before writing code, commit to a clear direction:

**Context Analysis:**
- WHO uses this? (persona, expertise level, device context)
- WHAT action should they take? (single primary goal)
- WHY should they trust/engage? (value proposition)

**Aesthetic Commitment:**
Choose and COMMIT to a bold direction. Timid design fails. Options include:
- Brutally minimal (Stripe, Linear)
- Maximalist editorial (Bloomberg, Awwwards winners)
- Retro-futuristic (Y2K revival, vaporwave)
- Organic/natural (earthy, hand-drawn, textured)
- Luxury/refined (fashion houses, premium brands)
- Playful/toy-like (Figma, Notion)
- Neo-brutalist (raw, exposed, intentionally rough)
- Art deco/geometric (bold shapes, gold accents)
- Soft/pastel (gradient meshes, dreamy)
- Industrial/utilitarian (data-dense, functional)

**The Memorability Test:** What ONE thing will users remember? If you can't answer this, the design lacks focus.

## 2. Design Token System

Use these systematic values. Never eyeball spacing or pick arbitrary colors.

### Typography Scale
```
--font-size-xs:   0.75rem   /* 12px - captions, labels */
--font-size-sm:   0.875rem  /* 14px - secondary text */
--font-size-base: 1rem      /* 16px - body text (MINIMUM for mobile) */
--font-size-lg:   1.125rem  /* 18px - lead paragraphs */
--font-size-xl:   1.25rem   /* 20px - H4 */
--font-size-2xl:  1.5rem    /* 24px - H3 */
--font-size-3xl:  2rem      /* 32px - H2 */
--font-size-4xl:  2.5rem    /* 40px - H1 */
--font-size-5xl:  3.5rem    /* 56px - Display */
```

**Typography Rules:**
- Line height: 1.5-1.6 for body, 1.1-1.2 for headings
- Line length: 45-75 characters (use max-w-prose or max-w-2xl)
- Maximum 2-3 typefaces per design
- NEVER use: Inter, Roboto, Arial as primary fonts (overused AI defaults)
- PAIR: One distinctive display font + one refined body font

### Spacing Scale (8px base)
```
--space-1:  0.25rem   /* 4px */
--space-2:  0.5rem    /* 8px */
--space-3:  0.75rem   /* 12px */
--space-4:  1rem      /* 16px */
--space-6:  1.5rem    /* 24px */
--space-8:  2rem      /* 32px */
--space-10: 2.5rem    /* 40px */
--space-12: 3rem      /* 48px */
--space-16: 4rem      /* 64px */
--space-20: 5rem      /* 80px */
--space-24: 6rem      /* 96px */
--space-32: 8rem      /* 128px - section gaps */
```

**Section Spacing:** 80-120px between major landing page sections.

### Color Rules
- 60-30-10 ratio: 60% dominant, 30% secondary, 10% accent
- ONE bold accent color maximum
- NEVER purple gradients on white (AI cliché)

### Animation Timing
```
--duration-fast:    100ms   /* Button clicks, toggles */
--duration-normal:  200ms   /* Most transitions */
--duration-slow:    300ms   /* Modals, drawers */
--duration-slower:  500ms   /* Page transitions */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1)
--ease-out:     cubic-bezier(0, 0, 0.2, 1)      /* Elements entering */
--ease-bounce:  cubic-bezier(0.34, 1.56, 0.64, 1)
```

**Animation Rules:**
- Button feedback: 100-150ms (must feel instantaneous)
- ONLY animate transform and opacity (GPU accelerated)
- NEVER animate width, height, margin, padding (triggers reflow)
- Respect prefers-reduced-motion

## 3. Accessibility Requirements (Non-Negotiable)

### Color Contrast (WCAG 2.1 AA)
| Element | Minimum Ratio |
|---------|--------------|
| Body text | 4.5:1 |
| Large text (18pt+ or 14pt bold) | 3:1 |
| UI components, icons | 3:1 |
| Focus indicators | 3:1 |

### Touch Targets
- Minimum size: 44×44px
- Minimum spacing: 8px between adjacent targets

### Interactive Elements
- ALL interactive elements MUST have visible focus states
- NEVER use outline: none without a replacement
- Tab order must be logical

### Semantic HTML
```html
<!-- CORRECT -->
<button type="button">Click me</button>
<a href="/page">Navigate</a>

<!-- WRONG -->
<div onclick="...">Click me</div>
<span class="link">Navigate</span>
```

## 4. Landing Page Patterns

### Above-the-Fold Essentials
1. Clear headline (5-10 words)
2. Supporting subheadline (value proposition)
3. Single primary CTA
4. Visual element (hero image, illustration, or product shot)

### Section Flow
```
1. Hero (headline + CTA + visual)
2. Social Proof (logos, testimonial snippet)
3. Problem/Solution
4. Features/Benefits (3-4 max)
5. Detailed Testimonials
6. Pricing (if applicable)
7. FAQ
8. Final CTA
9. Footer
```

### CTA Button Design
- Size: Minimum 44px height, padding 2x font size
- Color: High contrast, warm colors create urgency
- Copy: Action verbs, first-person ("Get my free trial" > "Sign up")
- One primary CTA per viewport

### Form Optimization
- Single column layout
- Minimize fields (4 fields vs 11 = 120% more conversions)
- Labels above inputs
- Validate on blur, not while typing

## 5. Anti-Patterns (NEVER DO)

### Visual Anti-Patterns
- ❌ Purple/blue gradients on white (AI cliché)
- ❌ Inter, Roboto, Arial as display fonts
- ❌ Inconsistent border-radius
- ❌ Shadows that don't match light source
- ❌ More than 3 font weights
- ❌ Rainbow color schemes without purpose

### UX Anti-Patterns
- ❌ Confirmshaming
- ❌ Pre-selected options benefiting company over user
- ❌ Fake urgency/scarcity indicators
- ❌ Infinite scroll without pagination option
- ❌ Disabled submit buttons before user attempts submission
- ❌ Placeholder text as labels

### Mobile Anti-Patterns
- ❌ Touch targets < 44×44px
- ❌ Body text < 16px
- ❌ Horizontal scrolling on content
- ❌ No tap feedback (must respond < 100ms)
- ❌ Fixed position elements blocking thumb zone

## 6. Pre-Delivery Checklist

### Accessibility ✓
- Color contrast ≥ 4.5:1 (text) / 3:1 (UI)
- Touch targets ≥ 44×44px
- All images have alt text
- All form fields have label
- Visible focus states on all interactive elements

### Visual Design ✓
- Clear typographic hierarchy (3-5 levels)
- Consistent spacing from token scale
- Maximum 2-3 typefaces
- Cohesive color palette (60-30-10)
- ONE memorable design element

### Technical ✓
- Mobile-first responsive approach
- Animations use only transform/opacity
- Dark mode support via CSS variables
- prefers-reduced-motion respected

### UX Integrity ✓
- Single primary goal per page
- No dark patterns
- Footer always accessible
- Error states are helpful
- Loading states exist

## 7. Implementation Notes

1. Start with the design token CSS - include variables at the top
2. Mobile-first - base styles are mobile, layer up with breakpoints
3. Semantic HTML first - use proper elements before adding ARIA
4. Test the extremes - smallest screen, longest content, empty states

**Remember:** Bold aesthetic choices + systematic execution = memorable interfaces. Generic is the enemy. Commit to a direction and execute with precision.
