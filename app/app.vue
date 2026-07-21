<script setup lang="ts">
useHead({
  titleTemplate: (chunk) =>
    chunk ? `Backlog Saga - ${chunk}` : "Backlog Saga",
  link: [
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    { rel: "icon", href: "/favicon.ico" },
    { rel: "apple-touch-icon", href: "/favicon.png" },
  ],
})
</script>

<template>
  <div class="ledger-frame">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
