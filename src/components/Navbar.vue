<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateToInventory = () => {
  router.push('/inventory')
}
</script>

<template>
  <div class="navbar">
    <div class="logo">升升食品</div>
    <div class="nav-items">
      <div class="nav-item" @click="navigateToInventory">出入库数据</div>
    </div>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #fff;
  padding: 0 2rem;
  height: 64px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #409eff;
  cursor: pointer;
}

.nav-items {
  display: flex;
  gap: 2rem;
}

.nav-item {
  font-size: 1rem;
  color: #606266;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.3s;
}

.nav-item:hover {
  color: #409eff;
  background-color: #f0f9ff;
}
</style>
