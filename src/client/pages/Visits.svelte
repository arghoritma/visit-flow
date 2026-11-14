<script lang="ts">
  import { router, usePage } from '@inertiajs/svelte'
  import { untrack } from 'svelte'
  import Layout from '../components/Layout.svelte'
  import Field from '../components/Field.svelte'
  import type { Activity, Entity, Paginated, Segment, VisitStatus } from '../../shared/types'

  interface Filters {
    segment: Segment | null
    status: VisitStatus | null
    from: string | null
    to: string | null
    search: string | null
  }

  let { activities, filters }: { activities: Paginated<Activity>; filters: Filters } = $props()

  const page = usePage()
  const user = $derived(page.props.auth.user)

  // --- Filter state (mirrors the URL; applied server-side, not client-side) ---
  // Initial value is intentionally captured once from the prop; the $effect
  // below resyncs on subsequent prop changes (e.g. browser back/forward).
  let search = $state(untrack(() => filters.search ?? ''))
  let segment = $state<Segment | ''>(untrack(() => filters.segment ?? ''))
  let status = $state<VisitStatus | ''>(untrack(() => filters.status ?? ''))
  let from = $state(untrack(() => filters.from ?? ''))
  let to = $state(untrack(() => filters.to ?? ''))
  let loading = $state(false)
  let listError = $state<string | null>(null)

  // Re-sync local filter state when the server prop changes (e.g. browser
  // back/forward navigation, which bypasses our own applyFilters calls).
  $effect(() => {
    search = filters.search ?? ''
    segment = filters.segment ?? ''
    status = filters.status ?? ''
    from = filters.from ?? ''
    to = filters.to ?? ''
  })

  function buildQuery(): Record<string, string> {
    const q: Record<string, string> = {}
    if (search.trim()) q.search = search.trim()
    if (segment) q.segment = segment
    if (status) q.status = status
    if (from) q.from = from
    if (to) q.to = to
    return q
  }

  function applyFilters() {
    router.get('/visits', buildQuery(), {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      onStart: () => {
        loading = true
        listError = null
      },
      onFinish: () => (loading = false),
      onError: () => {
        listError = 'Gagal memuat data. Coba lagi.'
      },
    })
  }

  // Debounced search-as-you-type; other filters apply immediately on change.
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  function onSearchInput() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(applyFilters, 350)
  }

  function clearFilters() {
    search = ''
    segment = ''
    status = ''
    from = ''
    to = ''
    applyFilters()
  }

  const hasActiveFilters = $derived(
    Boolean(search || segment || status || from || to),
  )

  function formatDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function pageUrl(p: number): string {
    return `/visits?${new URLSearchParams({ ...buildQuery(), page: String(p) }).toString()}`
  }

  // --- Status toggle ---
  let togglingId = $state<string | null>(null)
  let toggleError = $state<string | null>(null)

  async function toggleStatus(activity: Activity) {
    const next: VisitStatus = activity.status === 'VISITED' ? 'NOT_VISITED' : 'VISITED'
    togglingId = activity.id
    toggleError = null
    try {
      const res = await fetch(`/api/activities/${activity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        toggleError = 'Gagal memperbarui status kunjungan.'
        return
      }
      // Re-fetch just the `activities` prop from the current /visits URL
      // (same filters/page) so the list and its count stay consistent.
      router.reload({ only: ['activities'] })
    } catch {
      toggleError = 'Gagal memperbarui status kunjungan. Periksa koneksi Anda.'
    } finally {
      togglingId = null
    }
  }

  // --- Add visit modal ---
  let showAddModal = $state(false)
  let entityQuery = $state('')
  let entityOptions = $state<Entity[]>([])
  let entityLoading = $state(false)
  let selectedEntity = $state<Entity | null>(null)
  let entityListOpen = $state(false)

  let addDate = $state('')
  let addSegment = $state<Segment | ''>('')
  let addSalesName = $state('')
  let addSubmitting = $state(false)
  let addErrors = $state<Record<string, string>>({})

  function openAddModal() {
    showAddModal = true
    entityQuery = ''
    entityOptions = []
    selectedEntity = null
    addDate = ''
    addSegment = ''
    addSalesName = ''
    addErrors = {}
  }

  function closeAddModal() {
    showAddModal = false
  }

  let entitySearchTimer: ReturnType<typeof setTimeout> | undefined
  function onEntityQueryInput() {
    selectedEntity = null
    clearTimeout(entitySearchTimer)
    entitySearchTimer = setTimeout(fetchEntityOptions, 300)
  }

  async function fetchEntityOptions() {
    entityLoading = true
    try {
      const params = new URLSearchParams()
      if (entityQuery.trim()) params.set('search', entityQuery.trim())
      const res = await fetch(`/api/entities?${params.toString()}`)
      entityOptions = res.ok ? await res.json() : []
      entityListOpen = true
    } catch {
      entityOptions = []
    } finally {
      entityLoading = false
    }
  }

  function pickEntity(entity: Entity) {
    selectedEntity = entity
    entityQuery = `${entity.name} — ${entity.type}`
    addSegment = entity.segment
    entityListOpen = false
  }

  async function submitAdd(e: SubmitEvent) {
    e.preventDefault()
    addErrors = {}

    if (!selectedEntity) {
      addErrors = { entityId: 'Pilih entitas dari daftar.' }
      return
    }
    if (!addSegment) {
      addErrors = { ...addErrors, segment: 'Pilih segmen B2G atau B2B.' }
    }
    if (!addDate) {
      addErrors = { ...addErrors, visitDate: 'Pilih tanggal kunjungan.' }
    }
    if (!addSalesName || addSalesName.trim().length < 2) {
      addErrors = { ...addErrors, salesName: 'Nama Sales minimal 2 karakter.' }
    }
    if (Object.keys(addErrors).length > 0) return

    addSubmitting = true
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntity.id,
          segment: addSegment,
          visitDate: addDate,
          salesName: addSalesName.trim(),
        }),
      })
      if (res.status === 201) {
        showAddModal = false
        router.reload({ only: ['activities'] })
        return
      }
      const body = await res.json().catch(() => ({}))
      addErrors = body.errors ?? { general: 'Gagal menyimpan rencana kunjungan.' }
    } catch {
      addErrors = { general: 'Gagal menyimpan rencana kunjungan. Periksa koneksi Anda.' }
    } finally {
      addSubmitting = false
    }
  }

  const btnGhost =
    'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-border rounded-lg bg-transparent text-text font-semibold text-sm cursor-pointer transition-colors hover:bg-primary-soft hover:no-underline'
</script>

<svelte:head><title>Kunjungan</title></svelte:head>

{#if user}
  <Layout>
    <section class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <p class="m-0 text-xs font-bold uppercase tracking-[0.16em] text-primary">Visit Flow</p>
        <h1 class="mb-1 mt-3 text-[1.8rem] font-bold tracking-tight">Rencana Kunjungan</h1>
        <p class="m-0 text-muted text-sm">
          {activities.meta.total} kunjungan ditemukan — halaman {activities.meta.currentPage} dari {activities.meta.lastPage}.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover hover:border-primary-hover"
        onclick={openAddModal}
      >
        + Tambah Kunjungan
      </button>
    </section>

    <!-- Filters -->
    <section class="mt-6 rounded-[20px] border border-border bg-surface p-5">
      <div class="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2 max-[480px]:grid-cols-1">
        <div class="col-span-2 max-lg:col-span-3 max-sm:col-span-2 max-[480px]:col-span-1 min-w-0">
          <label for="search" class="block text-xs font-semibold mb-1.5 text-muted">Cari nama entitas</label>
          <input
            id="search"
            type="search"
            placeholder="mis. Melati"
            class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm focus:outline-2 focus:outline-primary focus:-outline-offset-1"
            bind:value={search}
            oninput={onSearchInput}
          />
        </div>
        <div class="min-w-0">
          <label for="segment" class="block text-xs font-semibold mb-1.5 text-muted">Segmen</label>
          <select
            id="segment"
            class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
            bind:value={segment}
            onchange={applyFilters}
          >
            <option value="">Semua</option>
            <option value="B2G">B2G</option>
            <option value="B2B">B2B</option>
          </select>
        </div>
        <div class="min-w-0">
          <label for="status" class="block text-xs font-semibold mb-1.5 text-muted">Status</label>
          <select
            id="status"
            class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
            bind:value={status}
            onchange={applyFilters}
          >
            <option value="">Semua</option>
            <option value="NOT_VISITED">Belum Dikunjungi</option>
            <option value="VISITED">Sudah Dikunjungi</option>
          </select>
        </div>
        <div class="min-w-0">
          <label for="from" class="block text-xs font-semibold mb-1.5 text-muted">Dari</label>
          <input
            id="from"
            type="date"
            class="w-full min-w-0 px-2 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
            bind:value={from}
            onchange={applyFilters}
          />
        </div>
        <div class="min-w-0">
          <label for="to" class="block text-xs font-semibold mb-1.5 text-muted">Sampai</label>
          <input
            id="to"
            type="date"
            class="w-full min-w-0 px-2 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
            bind:value={to}
            onchange={applyFilters}
          />
        </div>
      </div>
      {#if hasActiveFilters}
        <div class="mt-3 flex justify-end">
          <button type="button" class="text-sm font-semibold text-primary hover:text-primary-hover" onclick={clearFilters}>
            Hapus semua filter
          </button>
        </div>
      {/if}
    </section>

    {#if toggleError}
      <div class="mt-4 px-4 py-3 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-800" role="alert">
        {toggleError}
      </div>
    {/if}
    {#if listError}
      <div class="mt-4 px-4 py-3 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-800" role="alert">
        {listError}
      </div>
    {/if}

    <!-- List -->
    <section class="mt-6 overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <div class="overflow-x-auto" class:opacity-50={loading} aria-busy={loading}>
        <table class="w-full min-w-[760px] border-collapse text-sm">
          <thead class="bg-bg">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Entitas</th>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Segmen</th>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Wilayah</th>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Tanggal</th>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Sales</th>
              <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted">Status</th>
              <th class="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.1em] text-muted">Aksi</th>
            </tr>
          </thead>
          <tbody class="[&>tr:last-child>td]:border-b-0">
            {#each activities.data as a (a.id)}
              <tr class="transition-colors hover:bg-primary-soft/60">
                <td class="px-4 py-3.5 border-b border-border">
                  <div class="font-semibold">{a.entityName}</div>
                  <div class="text-xs text-muted">{a.entityType}</div>
                </td>
                <td class="px-4 py-3.5 border-b border-border">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-primary">
                    {a.segment}
                  </span>
                </td>
                <td class="px-4 py-3.5 border-b border-border text-muted">{a.region}</td>
                <td class="px-4 py-3.5 border-b border-border whitespace-nowrap">{formatDate(a.visitDate)}</td>
                <td class="px-4 py-3.5 border-b border-border">{a.salesName}</td>
                <td class="px-4 py-3.5 border-b border-border">
                  <span
                    class={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${a.status === 'VISITED' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}
                  >
                    {a.status === 'VISITED' ? 'Sudah Dikunjungi' : 'Belum Dikunjungi'}
                  </span>
                </td>
                <td class="px-4 py-3.5 border-b border-border text-right whitespace-nowrap">
                  <button
                    type="button"
                    class="text-xs font-semibold text-primary hover:text-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={togglingId === a.id}
                    onclick={() => toggleStatus(a)}
                  >
                    {togglingId === a.id
                      ? 'Menyimpan…'
                      : a.status === 'VISITED'
                        ? 'Tandai Belum Dikunjungi'
                        : 'Tandai Sudah Dikunjungi'}
                  </button>
                </td>
              </tr>
            {/each}
            {#if activities.data.length === 0 && !loading}
              <tr>
                <td colspan={7} class="text-center p-10">
                  <p class="m-0 font-semibold text-text">Tidak ada rencana kunjungan yang cocok.</p>
                  <p class="mt-1.5 mb-0 text-sm text-muted">
                    {hasActiveFilters
                      ? 'Coba ubah atau hapus beberapa filter di atas.'
                      : 'Mulai dengan menambahkan rencana kunjungan baru.'}
                  </p>
                  {#if hasActiveFilters}
                    <button type="button" class={`${btnGhost} mt-4`} onclick={clearFilters}>
                      Hapus semua filter
                    </button>
                  {/if}
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Pagination -->
    {#if activities.meta.lastPage > 1}
      <nav class="flex items-center justify-between gap-4 mt-4" aria-label="Pagination">
        {#if activities.meta.currentPage > 1}
          <a href={pageUrl(activities.meta.currentPage - 1)} class={btnGhost} data-inertia>Sebelumnya</a>
        {:else}
          <span class={`${btnGhost} opacity-35 cursor-not-allowed`} aria-disabled="true">Sebelumnya</span>
        {/if}
        <span class="text-muted text-sm">Halaman {activities.meta.currentPage} dari {activities.meta.lastPage}</span>
        {#if activities.meta.currentPage < activities.meta.lastPage}
          <a href={pageUrl(activities.meta.currentPage + 1)} class={btnGhost} data-inertia>Berikutnya</a>
        {:else}
          <span class={`${btnGhost} opacity-35 cursor-not-allowed`} aria-disabled="true">Berikutnya</span>
        {/if}
      </nav>
    {/if}
  </Layout>

  {#if showAddModal}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-visit-title"
    >
      <div class="w-full max-w-[480px] rounded-[20px] bg-surface border border-border shadow-card p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-4 mb-4">
          <h2 id="add-visit-title" class="m-0 text-lg font-bold tracking-tight">Tambah Rencana Kunjungan</h2>
          <button type="button" class="text-muted hover:text-text" aria-label="Tutup" onclick={closeAddModal}>✕</button>
        </div>

        {#if addErrors.general}
          <div class="mb-4 px-3 py-2.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-800" role="alert">
            {addErrors.general}
          </div>
        {/if}

        <form onsubmit={submitAdd} novalidate>
          <Field id="entity" label="Entitas" error={addErrors.entityId}>
            <div class="relative">
              <input
                id="entity"
                type="text"
                placeholder="Cari nama entitas…"
                autocomplete="off"
                class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm focus:outline-2 focus:outline-primary focus:-outline-offset-1"
                bind:value={entityQuery}
                oninput={onEntityQueryInput}
                onfocus={() => entityOptions.length > 0 && (entityListOpen = true)}
              />
              {#if entityListOpen}
                <div class="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-card">
                  {#if entityLoading}
                    <p class="px-3 py-2.5 text-sm text-muted">Mencari…</p>
                  {:else if entityOptions.length === 0}
                    <p class="px-3 py-2.5 text-sm text-muted">Tidak ada entitas ditemukan.</p>
                  {:else}
                    {#each entityOptions as entity (entity.id)}
                      <button
                        type="button"
                        class="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-primary-soft"
                        onclick={() => pickEntity(entity)}
                      >
                        <span class="font-semibold">{entity.name}</span>
                        <span class="text-xs text-muted">{entity.type} · {entity.segment} · {entity.region}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </Field>

          <Field id="add-segment" label="Segmen" error={addErrors.segment}>
            <select
              id="add-segment"
              class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
              bind:value={addSegment}
            >
              <option value="">Pilih segmen</option>
              <option value="B2G">B2G</option>
              <option value="B2B">B2B</option>
            </select>
          </Field>

          <Field id="add-date" label="Tanggal Kunjungan" error={addErrors.visitDate}>
            <input
              id="add-date"
              type="date"
              class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm"
              bind:value={addDate}
            />
          </Field>

          <Field id="add-sales" label="Nama Sales" error={addErrors.salesName}>
            <input
              id="add-sales"
              type="text"
              placeholder="mis. Dewi Anggraini"
              class="w-full px-3 py-2.5 border border-border rounded-lg bg-bg text-text text-sm focus:outline-2 focus:outline-primary focus:-outline-offset-1"
              bind:value={addSalesName}
            />
          </Field>

          <div class="flex items-center justify-end gap-3 mt-5">
            <button type="button" class={btnGhost} onclick={closeAddModal}>Batal</button>
            <button
              type="submit"
              class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover hover:border-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={addSubmitting}
            >
              {addSubmitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
{/if}
