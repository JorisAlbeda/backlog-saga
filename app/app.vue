<script setup lang="ts">
useHead({
  titleTemplate: (chunk) => (chunk ? `Backlog Saga - ${chunk}` : 'Backlog Saga')
})
</script>

<template>
  <div class="ledger-frame">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
