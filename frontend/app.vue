<script setup lang="ts">
const tenantIdInput = ref('');
const tenantId = ref('');

const chats = ref<any[]>([]);
const activeChatId = ref<string>();
</script>

<template>
  <main class="w-full flex items-center justify-center min-h-screen" v-if="!tenantId">
    <div class="flex flex-col w-1/4 space-y-3">
      <span class="text-2xl font-noto font-black text-center">Procure Lens</span>
      <span class="text-md text-center">Login as tenant</span>
      <input type="text" placeholder="Tenant ID" class="input input-bordered input-md w-full" v-model="tenantIdInput" />
      <button class="btn w-full btn-sm btn-secondary" @click="tenantId = tenantIdInput">Login</button>
    </div>
  </main>
  <main class="min-h-screen" v-else>
    <div class="flex items-center justify-between border-b h-16 p-2">
      <div class="text-xl font-noto font-extrabold">Procure Lens</div>
      <div class="flex space-x-2 items-center">
        <span class="text-zinc-600 font-extrabold">{{ tenantId }}</span>
        <button class="btn btn-square btn-ghost text-red-600" @click="tenantId = ''">
          <Icon name="solar:logout-broken" class="w-6 h-6" />
        </button>
      </div>
    </div>
    <div class="flex h-[calc(100vh-64px)] bg-zinc-100">
      <div class="flex flex-col w-72 border-r h-full bg-zinc-50 justify-between p-2">
        <div class="flex flex-col space-y-2">
          <span class="text-sm font-bold" v-if="chats.length > 0">Previous Chats</span>
        </div>
        <div class="my-4 text-center flex flex-col space-y-1" v-if="chats.length === 0">
          <span class="text-sm font-bold text-zinc-400">No chats found</span>
          <span class="text-xs text-zinc-400">Start a new chat</span>
        </div>
        <button class="btn w-full btn-sm btn-secondary mb-2">
          <Icon name="humbleicons:upload" class="w-5 h-5" />
          Add Data Source
        </button>
      </div>
      <div class="flex items-center justify-center h-full w-full" v-if="!activeChatId">
        <div class="flex flex-col max-w-[480px] w-full text-center space-y-8">
          <span class="text-2xl font-bold font-noto">What can I help with?</span>
          <form class="w-full rounded-lg flex p-1 items-start bg-white">
            <textarea type="text" class="focus:ring-0 focus:outline-none w-11/12 h-24 rounded-lg text-sm p-1 resize-none" placeholder="Message Procure Lens"/>
            <button class="w-1/12 p-2"><Icon name="uil:message" class="w-6 h-6"/></button>
          </form>
        </div>
      </div>
    </div>
  </main>
</template>
