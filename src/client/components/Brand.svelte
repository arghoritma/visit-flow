<script lang="ts">
  import { Link } from '@inertiajs/svelte'

  let { href, class: className = '' }: { href: string; class?: string } = $props()
</script>

<Link
  href={href}
  class={`inline-flex items-center gap-2 font-bold text-text tracking-tight hover:no-underline ${className}`}
>
  <svg
    class="text-primary shrink-0"
    viewBox="0 0 32 32"
    width="28"
    height="28"
    fill="none"
    aria-hidden="true"
  >
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M9 17.5 13.5 22 23 10" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <span>Visit Flow</span>
</Link>
