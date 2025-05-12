import { createRouter, createWebHistory } from 'vue-router'
import InventoryView from '../views/InventoryView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/inventory',
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
    },
  ],
})

export default router
