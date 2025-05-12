<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useInventoryStore } from '../stores/inventoryStore'
import { UploadFilled, DataAnalysis } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'

const inventoryStore = useInventoryStore()

// 上传文件处理
const tmallFileList = ref([])
const warehouseFileList = ref([])
const tmallLoading = ref(false)
const warehouseLoading = ref(false)

// 状态信息
const tmallStatus = ref('未上传')
const warehouseStatus = ref('未上传')

// 分析相关状态
const isAnalyzing = ref(false)
const analysisCompleted = ref(false)
const analysisResult = ref({
  inBoth: 0,
  onlyInTmall: 0,
  onlyInWarehouse: 0,
  quantityMismatch: [],
  missingInTmall: [],
  missingInWarehouse: [],
  tmallTotalQuantity: 0,
  warehouseTotalQuantity: 0,
  overShippedQuantity: 0,
  underShippedQuantity: 0,
  netDifference: 0,

  // 新增维度分析结果
  dateAnalysis: {
    missingInTmallByDate: {}, // 按日期统计仓库有而天猫没有的订单
    ordersByDate: {}, // 按日期统计订单数和差异
  },
  shopAnalysis: {
    // 按店铺统计订单差异
    missingOrdersByShop: {},
  },
  productAnalysis: {
    // 按商品分类统计差异
    productCategories: {},
  },
  possibleCauses: {
    // 可能的原因分析
    orderOriginAnalysis: null,
    shopSources: null,
    datePatterns: null,
  },
})

// 天猫数据上传
const handleTmallFileChange = (uploadFile) => {
  const file = uploadFile.raw
  if (!file) {
    ElMessage.error('文件对象无效')
    return
  }

  tmallFileList.value = [uploadFile]
  tmallLoading.value = true
  tmallStatus.value = '正在处理数据...'

  // 使用setTimeout避免UI阻塞
  setTimeout(() => {
    // 直接处理上传
    inventoryStore
      .processTmallExcel(file)
      .then((data) => {
        tmallStatus.value = `已成功读取 ${data.length} 条天猫数据`
        ElMessage.success(`成功导入 ${data.length} 条天猫数据`)
      })
      .catch((error) => {
        console.error('天猫数据导入失败:', error)
        tmallStatus.value = '导入失败'
        ElMessage.error(`天猫数据导入失败: ${error.message || '未知错误'}`)
        // 如果出错，清空文件列表
        tmallFileList.value = []
      })
      .finally(() => {
        tmallLoading.value = false
      })
  }, 100)
}

// 仓库数据上传
const handleWarehouseFileChange = (uploadFile) => {
  const file = uploadFile.raw
  if (!file) {
    ElMessage.error('文件对象无效')
    return
  }

  warehouseFileList.value = [uploadFile]
  warehouseLoading.value = true
  warehouseStatus.value = '正在处理数据...'

  // 使用setTimeout避免UI阻塞
  setTimeout(() => {
    // 直接处理上传
    inventoryStore
      .processWarehouseExcel(file)
      .then((data) => {
        warehouseStatus.value = `已成功读取 ${data.length} 条仓库数据`
        ElMessage.success(`成功导入 ${data.length} 条仓库数据`)
      })
      .catch((error) => {
        console.error('仓库数据导入失败:', error)
        warehouseStatus.value = '导入失败'
        ElMessage.error(`仓库数据导入失败: ${error.message || '未知错误'}`)
        // 如果出错，清空文件列表
        warehouseFileList.value = []
      })
      .finally(() => {
        warehouseLoading.value = false
      })
  }, 100)
}

// 数据分析
const runAnalysis = () => {
  if (inventoryStore.tmallData.length === 0 || inventoryStore.warehouseData.length === 0) {
    ElMessage.warning('请先上传天猫数据和仓库数据')
    return
  }

  // 直接在组件中实现分析逻辑，不依赖store的方法
  isAnalyzing.value = true

  // 清理订单号，移除前导单引号等特殊字符
  const cleanOrderNumber = (orderNum) => {
    if (!orderNum) return ''

    let cleaned = String(orderNum).trim()

    // 移除前导单引号 (')
    if (cleaned.startsWith("'")) {
      cleaned = cleaned.substring(1)
    }

    return cleaned
  }

  // 日期格式化
  const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return null
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    } catch (e) {
      return null
    }
  }

  // 使用setTimeout避免UI阻塞
  setTimeout(() => {
    try {
      // 创建订单号索引
      const tmallOrderMap = new Map()
      const warehouseOrderMap = new Map()

      // 用于统计的辅助变量
      const shopStats = {} // 店铺统计
      const productStats = {} // 商品分类统计
      const dateStats = {} // 日期统计

      // 按主订单编号聚合天猫数据，计算每个订单的总数量
      inventoryStore.tmallData.forEach((item) => {
        if (!item['主订单编号']) return

        const orderNumber = cleanOrderNumber(item['主订单编号'])
        if (!orderNumber) return

        const quantity = parseInt(item['购买数量']) || 0

        // 获取订单日期信息
        const createDate = formatDate(item['订单创建时间'])

        // 获取商品信息
        const productTitle = item['标题'] || '未知商品'

        if (tmallOrderMap.has(orderNumber)) {
          const existing = tmallOrderMap.get(orderNumber)
          existing.totalQuantity += quantity
          existing.items.push(item)

          // 如果之前没有日期但现在有了
          if (!existing.date && createDate) {
            existing.date = createDate
          }
        } else {
          tmallOrderMap.set(orderNumber, {
            orderNumber,
            totalQuantity: quantity,
            items: [item],
            date: createDate,
            productTitle: productTitle,
          })
        }

        // 更新日期统计
        if (createDate) {
          if (!dateStats[createDate]) {
            dateStats[createDate] = {
              tmallCount: 0,
              warehouseCount: 0,
              tmallQuantity: 0,
              warehouseQuantity: 0,
            }
          }
          dateStats[createDate].tmallCount++
          dateStats[createDate].tmallQuantity += quantity
        }
      })

      // 按线上订单号聚合仓库数据，计算每个订单的总数量
      inventoryStore.warehouseData.forEach((item) => {
        if (!item['线上订单号']) return

        const orderNumber = cleanOrderNumber(item['线上订单号'])
        if (!orderNumber) return

        // 获取数量并取绝对值，因为仓库发货记录是负数
        const rawQuantity = parseInt(item['数量']) || 0
        const quantity = Math.abs(rawQuantity)

        // 获取店铺信息
        const shopName = item['店铺名称'] || '未知店铺'

        // 获取出库日期
        const shippingDate = formatDate(item['进出仓日期'])

        // 获取商品信息
        const productCategory = item['分类'] || '未知分类'
        const productCode = item['商品编码'] || ''

        if (warehouseOrderMap.has(orderNumber)) {
          const existing = warehouseOrderMap.get(orderNumber)
          existing.totalQuantity += quantity
          existing.items.push(item)

          // 收集店铺信息
          if (!existing.shopName && shopName) {
            existing.shopName = shopName
          }

          // 收集日期信息
          if (!existing.shippingDate && shippingDate) {
            existing.shippingDate = shippingDate
          }

          // 收集商品分类信息
          if (productCategory && !existing.categories.includes(productCategory)) {
            existing.categories.push(productCategory)
          }
        } else {
          warehouseOrderMap.set(orderNumber, {
            orderNumber,
            totalQuantity: quantity,
            items: [item],
            shopName: shopName,
            shippingDate: shippingDate,
            categories: productCategory ? [productCategory] : [],
            productCode: productCode,
          })

          // 更新店铺统计
          if (shopName) {
            if (!shopStats[shopName]) {
              shopStats[shopName] = {
                orderCount: 0,
                inTmall: 0,
                notInTmall: 0,
              }
            }
            shopStats[shopName].orderCount++
          }
        }

        // 更新商品分类统计
        if (productCategory) {
          if (!productStats[productCategory]) {
            productStats[productCategory] = {
              orderCount: 0,
              inTmall: 0,
              notInTmall: 0,
            }
          }
          productStats[productCategory].orderCount++
        }

        // 更新日期统计
        if (shippingDate) {
          if (!dateStats[shippingDate]) {
            dateStats[shippingDate] = {
              tmallCount: 0,
              warehouseCount: 0,
              tmallQuantity: 0,
              warehouseQuantity: 0,
            }
          }
          dateStats[shippingDate].warehouseCount++
          dateStats[shippingDate].warehouseQuantity += quantity
        }
      })

      // 比较两个数据源
      // 1. 找出仓库有记录但天猫没有的订单
      const missingInTmall = []
      const missingInTmallByDate = {}
      const missingOrdersByShop = {}

      for (const [orderNumber, warehouseOrder] of warehouseOrderMap.entries()) {
        if (!tmallOrderMap.has(orderNumber)) {
          missingInTmall.push({
            orderNumber,
            quantity: warehouseOrder.totalQuantity,
            warehouseDetails: warehouseOrder.items,
            shopName: warehouseOrder.shopName,
            shippingDate: warehouseOrder.shippingDate,
            categories: warehouseOrder.categories,
            productCode: warehouseOrder.productCode,
          })

          // 更新按日期统计
          const dateKey = warehouseOrder.shippingDate || '未知日期'
          if (!missingInTmallByDate[dateKey]) {
            missingInTmallByDate[dateKey] = {
              orderCount: 0,
              totalQuantity: 0,
            }
          }
          missingInTmallByDate[dateKey].orderCount++
          missingInTmallByDate[dateKey].totalQuantity += warehouseOrder.totalQuantity

          // 更新按店铺统计
          const shopKey = warehouseOrder.shopName || '未知店铺'
          if (!missingOrdersByShop[shopKey]) {
            missingOrdersByShop[shopKey] = {
              orderCount: 0,
              totalQuantity: 0,
            }
          }
          missingOrdersByShop[shopKey].orderCount++
          missingOrdersByShop[shopKey].totalQuantity += warehouseOrder.totalQuantity

          // 更新店铺统计
          if (warehouseOrder.shopName) {
            if (shopStats[warehouseOrder.shopName]) {
              shopStats[warehouseOrder.shopName].notInTmall++
            }
          }

          // 更新商品分类统计
          for (const category of warehouseOrder.categories) {
            if (productStats[category]) {
              productStats[category].notInTmall++
            }
          }
        } else {
          // 有匹配的天猫订单
          if (warehouseOrder.shopName && shopStats[warehouseOrder.shopName]) {
            shopStats[warehouseOrder.shopName].inTmall++
          }

          for (const category of warehouseOrder.categories) {
            if (productStats[category]) {
              productStats[category].inTmall++
            }
          }
        }
      }

      // 2. 找出天猫有记录但仓库没有的订单
      const missingInWarehouse = []
      for (const [orderNumber, tmallOrder] of tmallOrderMap.entries()) {
        if (!warehouseOrderMap.has(orderNumber)) {
          missingInWarehouse.push({
            orderNumber,
            quantity: tmallOrder.totalQuantity,
            tmallDetails: tmallOrder.items,
            orderDate: tmallOrder.date,
            productTitle: tmallOrder.productTitle,
          })
        }
      }

      // 3. 找出数量不匹配的订单
      const quantityMismatch = []
      for (const [orderNumber, tmallOrder] of tmallOrderMap.entries()) {
        if (warehouseOrderMap.has(orderNumber)) {
          const warehouseOrder = warehouseOrderMap.get(orderNumber)
          if (tmallOrder.totalQuantity !== warehouseOrder.totalQuantity) {
            // 计算差值：仓库发货数量 - 天猫订单数量
            // 如果差值为正，表示仓库多发了；如果为负，表示仓库少发了
            const difference = warehouseOrder.totalQuantity - tmallOrder.totalQuantity

            quantityMismatch.push({
              orderNumber,
              tmallQuantity: tmallOrder.totalQuantity,
              warehouseQuantity: warehouseOrder.totalQuantity,
              difference: difference,
              tmallDetails: tmallOrder.items,
              warehouseDetails: warehouseOrder.items,
              orderDate: tmallOrder.date,
              shippingDate: warehouseOrder.shippingDate,
              shopName: warehouseOrder.shopName,
              categories: warehouseOrder.categories,
            })
          }
        }
      }

      // 分析可能的原因

      // 1. 分析仓库多出来的订单来源
      const shopSourcesAnalysis = Object.entries(missingOrdersByShop)
        .sort((a, b) => b[1].orderCount - a[1].orderCount)
        .map(([shop, stats]) => {
          const percentage = ((stats.orderCount / missingInTmall.length) * 100).toFixed(1)
          return {
            shopName: shop,
            orderCount: stats.orderCount,
            percentage: `${percentage}%`,
            totalQuantity: stats.totalQuantity,
          }
        })

      // 2. 分析日期模式
      const datePatternAnalysis = Object.entries(missingInTmallByDate)
        .sort((a, b) => b[1].orderCount - a[1].orderCount)
        .map(([date, stats]) => {
          const percentage = ((stats.orderCount / missingInTmall.length) * 100).toFixed(1)
          return {
            date: date,
            orderCount: stats.orderCount,
            percentage: `${percentage}%`,
            totalQuantity: stats.totalQuantity,
          }
        })

      // 3. 分析可能的原因
      let orderOriginAnalysis = null

      // 如果有超过50%的缺失订单来自同一个店铺，可能是其他渠道订单
      const mainShopSource = shopSourcesAnalysis[0]
      if (mainShopSource && parseFloat(mainShopSource.percentage) > 50) {
        orderOriginAnalysis = `有${mainShopSource.percentage}的缺失订单来自"${mainShopSource.shopName}"，这些可能是非天猫渠道的订单`
      }

      // 如果有超过50%的缺失订单集中在某一天，可能是导出数据的时间范围不一致
      const mainDatePattern = datePatternAnalysis[0]
      if (mainDatePattern && parseFloat(mainDatePattern.percentage) > 50) {
        orderOriginAnalysis = orderOriginAnalysis || ''
        if (orderOriginAnalysis) orderOriginAnalysis += '\n'
        orderOriginAnalysis += `有${mainDatePattern.percentage}的缺失订单出现在"${mainDatePattern.date}"，可能是天猫数据的导出时间范围与仓库不一致`
      }

      // 更新分析结果
      const inBoth = [...tmallOrderMap.keys()].filter((key) => warehouseOrderMap.has(key)).length
      const onlyInTmall = missingInWarehouse.length
      const onlyInWarehouse = missingInTmall.length

      // 计算总数量差异
      let tmallTotalQuantity = 0
      let warehouseTotalQuantity = 0
      let overShippedQuantity = 0 // 仓库多发总数
      let underShippedQuantity = 0 // 仓库少发总数

      // 计算天猫总数量
      tmallOrderMap.forEach((order) => {
        tmallTotalQuantity += order.totalQuantity
      })

      // 计算仓库总数量
      warehouseOrderMap.forEach((order) => {
        warehouseTotalQuantity += order.totalQuantity
      })

      // 计算多发和少发的总数量
      quantityMismatch.forEach((item) => {
        if (item.difference > 0) {
          overShippedQuantity += item.difference
        } else {
          underShippedQuantity += Math.abs(item.difference)
        }
      })

      // 计算仅在仓库存在的订单的总发货量
      missingInTmall.forEach((item) => {
        overShippedQuantity += item.quantity
      })

      // 计算仅在天猫存在的订单的总销售量
      missingInWarehouse.forEach((item) => {
        underShippedQuantity += item.quantity
      })

      // 计算净差值
      const netDifference = overShippedQuantity - underShippedQuantity

      // 直接赋值分析结果，不通过store
      analysisResult.value = {
        inBoth,
        onlyInTmall,
        onlyInWarehouse,
        quantityMismatch,
        missingInTmall,
        missingInWarehouse,
        tmallTotalQuantity,
        warehouseTotalQuantity,
        overShippedQuantity,
        underShippedQuantity,
        netDifference,

        // 新增多维度分析结果
        dateAnalysis: {
          missingInTmallByDate: missingInTmallByDate,
          ordersByDate: dateStats,
        },
        shopAnalysis: {
          missingOrdersByShop: missingOrdersByShop,
          shopStats: shopStats,
        },
        productAnalysis: {
          productStats: productStats,
        },
        possibleCauses: {
          orderOriginAnalysis: orderOriginAnalysis,
          shopSources: shopSourcesAnalysis,
          datePatterns: datePatternAnalysis,
        },
      }

      analysisCompleted.value = true
      ElMessage.success('数据分析完成')
    } catch (error) {
      console.error('分析数据出错:', error)
      ElMessage.error(`分析失败: ${error.message || '未知错误'}`)
      // 重置分析结果
      resetAnalysis()
    } finally {
      isAnalyzing.value = false
    }
  }, 100)
}

// 从store获取数据
const tmallData = computed(() => inventoryStore.tmallData)
const warehouseData = computed(() => inventoryStore.warehouseData)

// 清空数据
const clearTmallData = () => {
  inventoryStore.clearTmallData()
  tmallFileList.value = []
  tmallStatus.value = '数据已清空'
  // 清空分析结果
  resetAnalysis()
  ElMessage.success('天猫数据已清空')
}

const clearWarehouseData = () => {
  inventoryStore.clearWarehouseData()
  warehouseFileList.value = []
  warehouseStatus.value = '数据已清空'
  // 清空分析结果
  resetAnalysis()
  ElMessage.success('仓库数据已清空')
}

// 重置分析结果
const resetAnalysis = () => {
  analysisResult.value = {
    inBoth: 0,
    onlyInTmall: 0,
    onlyInWarehouse: 0,
    quantityMismatch: [],
    missingInTmall: [],
    missingInWarehouse: [],
    tmallTotalQuantity: 0,
    warehouseTotalQuantity: 0,
    overShippedQuantity: 0,
    underShippedQuantity: 0,
    netDifference: 0,

    // 重置多维度分析结果
    dateAnalysis: {
      missingInTmallByDate: {},
      ordersByDate: {},
    },
    shopAnalysis: {
      missingOrdersByShop: {},
      shopStats: {},
    },
    productAnalysis: {
      productStats: {},
    },
    possibleCauses: {
      orderOriginAnalysis: null,
      shopSources: null,
      datePatterns: null,
    },
  }
  analysisCompleted.value = false
}

// 导出分析结果
const exportAnalysisToExcel = () => {
  if (!analysisCompleted.value) {
    ElMessage.warning('请先完成数据分析')
    return
  }

  // 清理订单号格式
  const formatOrderNumber = (orderNum) => {
    if (!orderNum) return ''
    return String(orderNum).replace(/^'/, '') // 移除前导单引号
  }

  try {
    // 准备量不匹配的数据
    const quantityMismatchData = analysisResult.value.quantityMismatch.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      天猫数量: item.tmallQuantity,
      仓库数量: item.warehouseQuantity,
      差异: item.difference,
      备注: item.difference > 0 ? '仓库多发' : '仓库少发',
      订单日期: item.orderDate || '',
      发货日期: item.shippingDate || '',
      店铺名称: item.shopName || '',
    }))

    // 准备缺失订单数据
    const missingInTmallData = analysisResult.value.missingInTmall.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      仓库数量: item.quantity,
      天猫状态: '缺失',
      店铺名称: item.shopName || '未知',
      发货日期: item.shippingDate || '',
      商品分类: (item.categories || []).join(', '),
      备注: '仓库有发货记录，天猫无订单记录',
    }))

    const missingInWarehouseData = analysisResult.value.missingInWarehouse.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      天猫数量: item.quantity,
      仓库状态: '缺失',
      订单日期: item.orderDate || '',
      商品名称: item.productTitle || '',
      备注: '天猫有订单记录，仓库无发货记录',
    }))

    // 准备店铺来源分析数据
    const shopSourcesData = (analysisResult.value.possibleCauses.shopSources || []).map((item) => ({
      店铺名称: item.shopName,
      订单数量: item.orderCount,
      占比: item.percentage,
      总数量: item.totalQuantity,
    }))

    // 准备日期分析数据
    const datePatternData = (analysisResult.value.possibleCauses.datePatterns || []).map(
      (item) => ({
        日期: item.date,
        订单数量: item.orderCount,
        占比: item.percentage,
        总数量: item.totalQuantity,
      }),
    )

    // 准备总体统计数据
    const summaryData = [
      {
        总订单数:
          analysisResult.value.inBoth +
          analysisResult.value.onlyInTmall +
          analysisResult.value.onlyInWarehouse,
        天猫订单数: analysisResult.value.inBoth + analysisResult.value.onlyInTmall,
        仓库订单数: analysisResult.value.inBoth + analysisResult.value.onlyInWarehouse,
        同时存在订单数: analysisResult.value.inBoth,
        仅天猫存在订单数: analysisResult.value.onlyInTmall,
        仅仓库存在订单数: analysisResult.value.onlyInWarehouse,
        天猫总数量: analysisResult.value.tmallTotalQuantity,
        仓库总数量: analysisResult.value.warehouseTotalQuantity,
        多发总数: analysisResult.value.overShippedQuantity,
        少发总数: analysisResult.value.underShippedQuantity,
        总差异: analysisResult.value.netDifference,
      },
    ]

    // 创建工作簿
    const wb = XLSX.utils.book_new()

    // 添加摘要工作表
    const ws0 = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws0, '分析摘要')

    // 添加数量不匹配工作表
    if (quantityMismatchData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(quantityMismatchData)
      XLSX.utils.book_append_sheet(wb, ws1, '数量不匹配订单')
    }

    // 添加仓库有天猫没有的订单工作表
    if (missingInTmallData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(missingInTmallData)
      XLSX.utils.book_append_sheet(wb, ws2, '天猫缺失订单')
    }

    // 添加天猫有仓库没有的订单工作表
    if (missingInWarehouseData.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(missingInWarehouseData)
      XLSX.utils.book_append_sheet(wb, ws3, '仓库缺失订单')
    }

    // 添加店铺分析工作表
    if (shopSourcesData.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(shopSourcesData)
      XLSX.utils.book_append_sheet(wb, ws4, '店铺来源分析')
    }

    // 添加日期分析工作表
    if (datePatternData.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(datePatternData)
      XLSX.utils.book_append_sheet(wb, ws5, '日期分析')
    }

    // 导出文件
    XLSX.writeFile(wb, '订单差异多维度分析.xlsx')

    ElMessage.success('分析结果已导出')
  } catch (error) {
    console.error('导出Excel失败:', error)
    ElMessage.error('导出失败，请重试')
  }
}
</script>

<template>
  <div class="inventory-container">
    <h1 class="page-title">出入库数据</h1>

    <!-- 天猫数据部分 -->
    <section class="data-section">
      <h2 class="section-title">天猫数据</h2>

      <div class="upload-section">
        <el-upload
          class="excel-uploader"
          :auto-upload="false"
          :file-list="tmallFileList"
          :on-change="handleTmallFileChange"
          :limit="1"
          accept=".xlsx,.xls"
          :show-file-list="true"
          :disabled="tmallLoading"
        >
          <el-button type="primary" :icon="UploadFilled" :loading="tmallLoading">
            {{ tmallLoading ? '处理中...' : '上传天猫Excel文件' }}
          </el-button>
          <template #tip>
            <div class="el-upload__tip">请上传Excel格式文件</div>
          </template>
        </el-upload>

        <el-button
          @click="clearTmallData"
          type="danger"
          plain
          :disabled="tmallLoading || !tmallData.length"
          >清空数据</el-button
        >

        <div
          class="status-indicator"
          :class="{
            loading: tmallLoading,
            success: tmallStatus.includes('成功'),
            error: tmallStatus.includes('失败'),
          }"
        >
          <el-icon v-if="tmallLoading" class="is-loading"
            ><svg class="circular" viewBox="25 25 50 50">
              <circle class="path" cx="50" cy="50" r="20" fill="none" /></svg
          ></el-icon>
          <span>{{ tmallStatus }}</span>
        </div>
      </div>
    </section>

    <!-- 仓库数据部分 -->
    <section class="data-section">
      <h2 class="section-title">仓库数据</h2>

      <div class="upload-section">
        <el-upload
          class="excel-uploader"
          :auto-upload="false"
          :file-list="warehouseFileList"
          :on-change="handleWarehouseFileChange"
          :limit="1"
          accept=".xlsx,.xls"
          :show-file-list="true"
          :disabled="warehouseLoading"
        >
          <el-button type="primary" :icon="UploadFilled" :loading="warehouseLoading">
            {{ warehouseLoading ? '处理中...' : '上传仓库Excel文件' }}
          </el-button>
          <template #tip>
            <div class="el-upload__tip">请上传Excel格式文件</div>
          </template>
        </el-upload>

        <el-button
          @click="clearWarehouseData"
          type="danger"
          plain
          :disabled="warehouseLoading || !warehouseData.length"
          >清空数据</el-button
        >

        <div
          class="status-indicator"
          :class="{
            loading: warehouseLoading,
            success: warehouseStatus.includes('成功'),
            error: warehouseStatus.includes('失败'),
          }"
        >
          <el-icon v-if="warehouseLoading" class="is-loading"
            ><svg class="circular" viewBox="25 25 50 50">
              <circle class="path" cx="50" cy="50" r="20" fill="none" /></svg
          ></el-icon>
          <span>{{ warehouseStatus }}</span>
        </div>
      </div>
    </section>

    <!-- 数据分析部分 -->
    <section class="data-section">
      <h2 class="section-title">数据分析</h2>

      <div class="analysis-section">
        <el-button
          type="primary"
          :icon="DataAnalysis"
          @click="runAnalysis"
          :loading="isAnalyzing"
          :disabled="tmallData.length === 0 || warehouseData.length === 0 || isAnalyzing"
        >
          {{ isAnalyzing ? '正在分析数据...' : '开始分析' }}
        </el-button>

        <el-button
          type="success"
          @click="exportAnalysisToExcel"
          v-if="analysisCompleted && !isAnalyzing"
        >
          导出分析结果
        </el-button>
      </div>

      <!-- 分析结果展示 -->
      <div v-if="analysisCompleted && !isAnalyzing" class="analysis-results">
        <div class="stats-summary">
          <div class="stat-item">
            <div class="stat-label">总订单分析</div>
            <div class="stat-value">
              共
              {{
                analysisResult.inBoth + analysisResult.onlyInTmall + analysisResult.onlyInWarehouse
              }}
              个订单
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">同时存在</div>
            <div class="stat-value">{{ analysisResult.inBoth }} 个订单</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip
                content="天猫系统中有订单记录，但仓库系统中没有对应发货记录的订单。可能表示这些订单未发货或发货数据未录入系统。"
                placement="top"
                effect="light"
              >
                <span class="tooltip-label">仅在天猫存在</span>
              </el-tooltip>
            </div>
            <div class="stat-value">{{ analysisResult.onlyInTmall }} 个订单</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip
                content="仓库系统中有发货记录，但天猫系统中没有对应订单记录的订单。可能表示天猫订单数据丢失或这些订单来自其他销售渠道。"
                placement="top"
                effect="light"
              >
                <span class="tooltip-label">仅在仓库存在</span>
              </el-tooltip>
            </div>
            <div class="stat-value">{{ analysisResult.onlyInWarehouse }} 个订单</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">数量不匹配</div>
            <div class="stat-value">{{ analysisResult.quantityMismatch.length }} 个订单</div>
          </div>
        </div>

        <div class="stats-summary">
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip content="天猫订单总数量" placement="top" effect="light">
                <span class="tooltip-label">天猫总数量</span>
              </el-tooltip>
            </div>
            <div class="stat-value">{{ analysisResult.tmallTotalQuantity }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip content="仓库发货总数量" placement="top" effect="light">
                <span class="tooltip-label">仓库总数量</span>
              </el-tooltip>
            </div>
            <div class="stat-value">{{ analysisResult.warehouseTotalQuantity }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip content="仓库发货总数量 - 天猫订单总数量" placement="top" effect="light">
                <span class="tooltip-label">总数量差异</span>
              </el-tooltip>
            </div>
            <div
              class="stat-value"
              :class="{
                'text-danger': analysisResult.netDifference > 0,
                'text-warning': analysisResult.netDifference < 0,
              }"
            >
              {{ analysisResult.netDifference > 0 ? '+' : '' }}{{ analysisResult.netDifference }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip content="仓库超出天猫订单发货的总数量" placement="top" effect="light">
                <span class="tooltip-label">多发数量</span>
              </el-tooltip>
            </div>
            <div class="stat-value text-danger">+{{ analysisResult.overShippedQuantity }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              <el-tooltip content="天猫订单中未发货的总数量" placement="top" effect="light">
                <span class="tooltip-label">少发数量</span>
              </el-tooltip>
            </div>
            <div class="stat-value text-warning">-{{ analysisResult.underShippedQuantity }}</div>
          </div>
        </div>

        <h2 class="section-title-special">
          <span class="line"></span>
          <span class="title-text">多维度分析</span>
          <span class="line"></span>
        </h2>

        <!-- 可能的原因分析 -->
        <div class="result-section" v-if="analysisResult.possibleCauses.orderOriginAnalysis">
          <h3 class="result-title">问题原因分析</h3>
          <div class="cause-analysis">
            <div class="alert-info">
              <p>根据数据分析，以下可能是仓库多出订单的原因：</p>
              <p>{{ analysisResult.possibleCauses.orderOriginAnalysis }}</p>
            </div>
          </div>
        </div>

        <!-- 店铺分析 -->
        <div
          class="result-section"
          v-if="
            analysisResult.possibleCauses.shopSources &&
            analysisResult.possibleCauses.shopSources.length > 0
          "
        >
          <h3 class="result-title">仓库多出订单的店铺来源分析</h3>
          <el-table
            :data="analysisResult.possibleCauses.shopSources.slice(0, 10)"
            border
            style="width: 100%"
          >
            <el-table-column prop="shopName" label="店铺名称" min-width="180" />
            <el-table-column prop="orderCount" label="订单数量" width="120" />
            <el-table-column prop="percentage" label="占比" width="100" />
            <el-table-column prop="totalQuantity" label="总数量" width="100" />
          </el-table>
        </div>

        <!-- 日期分析 -->
        <div
          class="result-section"
          v-if="
            analysisResult.possibleCauses.datePatterns &&
            analysisResult.possibleCauses.datePatterns.length > 0
          "
        >
          <h3 class="result-title">仓库多出订单的日期分布</h3>
          <el-table
            :data="analysisResult.possibleCauses.datePatterns.slice(0, 10)"
            border
            style="width: 100%"
          >
            <el-table-column prop="date" label="日期" min-width="150" />
            <el-table-column prop="orderCount" label="订单数量" width="120" />
            <el-table-column prop="percentage" label="占比" width="100" />
            <el-table-column prop="totalQuantity" label="总数量" width="100" />
          </el-table>
        </div>

        <h2 class="section-title-special">
          <span class="line"></span>
          <span class="title-text">详细分析结果</span>
          <span class="line"></span>
        </h2>

        <!-- 数量不匹配的订单 -->
        <div class="result-section">
          <h3 class="result-title">数量不匹配的订单</h3>
          <div v-if="analysisResult.quantityMismatch.length === 0" class="empty-result">
            没有发现数量不匹配的订单
          </div>
          <template v-else>
            <div class="result-count">
              发现 {{ analysisResult.quantityMismatch.length }} 个数量不匹配的订单
            </div>
            <el-table
              :data="analysisResult.quantityMismatch.slice(0, 100)"
              border
              style="width: 100%"
              max-height="400"
            >
              <el-table-column prop="orderNumber" label="订单号" width="200" />
              <el-table-column prop="tmallQuantity" label="天猫数量" width="120" />
              <el-table-column prop="warehouseQuantity" label="仓库数量" width="160" />
              <el-table-column prop="difference" label="差异(仓库-天猫)" width="150">
                <template #default="scope">
                  <span :class="scope.row.difference > 0 ? 'text-danger' : 'text-warning'">
                    {{ scope.row.difference }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="结论" min-width="140">
                <template #default="scope">
                  <span :class="scope.row.difference > 0 ? 'text-danger' : 'text-warning'">
                    {{ scope.row.difference > 0 ? '仓库多发' : '仓库少发' }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="analysisResult.quantityMismatch.length > 100" class="more-data-hint">
              仅显示前100条记录，完整数据请导出Excel
            </div>
          </template>
        </div>

        <!-- 仓库有记录但天猫没有的订单 -->
        <div class="result-section">
          <h3 class="result-title">仓库有发货但天猫无订单记录</h3>
          <div v-if="analysisResult.missingInTmall.length === 0" class="empty-result">
            没有发现仓库有记录但天猫没有的订单
          </div>
          <template v-else>
            <div class="result-count">
              发现 {{ analysisResult.missingInTmall.length }} 个仓库有记录但天猫没有的订单
            </div>
            <el-table
              :data="analysisResult.missingInTmall.slice(0, 100)"
              border
              style="width: 100%"
              max-height="400"
            >
              <el-table-column prop="orderNumber" label="订单号" width="200" />
              <el-table-column prop="quantity" label="仓库发货数量" width="150" />
              <el-table-column prop="shopName" label="店铺名称" width="150" />
              <el-table-column prop="shippingDate" label="发货日期" width="150" />
              <el-table-column label="问题分析" min-width="140">
                <template #default>
                  <span class="text-danger">天猫订单数据缺失</span>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="analysisResult.missingInTmall.length > 100" class="more-data-hint">
              仅显示前100条记录，完整数据请导出Excel
            </div>
          </template>
        </div>

        <!-- 天猫有记录但仓库没有的订单 -->
        <div class="result-section">
          <h3 class="result-title">天猫有订单但仓库无发货记录</h3>
          <div v-if="analysisResult.missingInWarehouse.length === 0" class="empty-result">
            没有发现天猫有记录但仓库没有的订单
          </div>
          <template v-else>
            <div class="result-count">
              发现 {{ analysisResult.missingInWarehouse.length }} 个天猫有记录但仓库没有的订单
            </div>
            <el-table
              :data="analysisResult.missingInWarehouse.slice(0, 100)"
              border
              style="width: 100%"
              max-height="400"
            >
              <el-table-column prop="orderNumber" label="订单号" width="200" />
              <el-table-column prop="quantity" label="天猫订单数量" width="150" />
              <el-table-column prop="orderDate" label="订单日期" width="150" />
              <el-table-column label="问题分析" min-width="140">
                <template #default>
                  <span class="text-warning">仓库发货数据缺失</span>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="analysisResult.missingInWarehouse.length > 100" class="more-data-hint">
              仅显示前100条记录，完整数据请导出Excel
            </div>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inventory-container {
  padding-left: calc(15% + 2rem);
  padding-right: calc(15% + 2rem);
  padding-top: 2rem;
  padding-bottom: 2rem;
  height: calc(100vh - 64px);
  overflow-y: auto;
}

.page-title {
  font-size: 1.5rem;
  color: #303133;
  margin-bottom: 1.5rem;
}

.data-section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1.2rem;
  color: #303133;
  margin-bottom: 1rem;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

.section-title-special {
  font-size: 2rem;
  font-weight: normal;
  color: #303133;
  margin: 35px 0 25px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  width: 100%;
}

.section-title-special .line {
  flex-grow: 1;
  height: 1px;
  background-color: #dcdfe6;
  max-width: none;
}

.section-title-special .title-text {
  color: #606266;
  white-space: nowrap;
  padding: 0 20px;
}

.upload-section,
.analysis-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.excel-uploader {
  flex-grow: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #606266;
  margin-left: 10px;
  gap: 5px;
}

.status-indicator.loading {
  color: #e6a23c;
}

.status-indicator.success {
  color: #67c23a;
}

.status-indicator.error {
  color: #f56c6c;
}

.circular {
  width: 16px;
  height: 16px;
  animation: loading-rotate 2s linear infinite;
}

.path {
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  stroke-width: 2;
  stroke: currentColor;
  stroke-linecap: round;
  animation: loading-dash 1.5s ease-in-out infinite;
}

@keyframes loading-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes loading-dash {
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -40px;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -120px;
  }
}

.stats-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
}

.stat-item {
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 15px;
  min-width: 160px;
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 20px;
  color: #303133;
  font-weight: 500;
}

.analysis-results {
  margin-top: 20px;
}

.empty-result {
  color: #909399;
  text-align: center;
  padding: 15px 0;
}

.result-count {
  margin-bottom: 15px;
  font-weight: bold;
  color: #303133;
}

.text-danger {
  color: #f56c6c;
}

.text-warning {
  color: #e6a23c;
}

.more-data-hint {
  margin-top: 10px;
  color: #909399;
  font-size: 12px;
  text-align: right;
}

.tooltip-label {
  cursor: help;
  border-bottom: 1px dashed #b4b4b4;
  display: inline-block;
}

.el-tooltip__popper {
  max-width: 300px;
  line-height: 1.5;
}

.result-section {
  margin-bottom: 35px;
}

.result-title {
  font-size: 1.1rem;
  color: #303133;
  margin-bottom: 15px;
  font-weight: normal;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

.cause-analysis {
  margin-bottom: 20px;
}

.alert-info {
  background-color: #f0f9ff;
  border-left: 4px solid #409eff;
  padding: 15px;
  border-radius: 0 4px 4px 0;
  color: #0a58ca;
  margin-bottom: 15px;
}

.alert-info p {
  margin: 5px 0;
}

@media (max-width: 1600px) {
  .inventory-container {
    padding-left: calc(10% + 2rem);
    padding-right: calc(10% + 2rem);
  }
}

@media (max-width: 1200px) {
  .inventory-container {
    padding-left: 4rem;
    padding-right: 4rem;
  }
}

@media (max-width: 900px) {
  .inventory-container {
    padding-left: 2rem;
    padding-right: 2rem;
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }

  .stats-summary {
    flex-direction: column;
  }

  .stat-item {
    margin-bottom: 10px;
  }

  .upload-section {
    flex-direction: column;
    align-items: flex-start;
  }

  :deep(.el-upload) {
    width: 100%;
  }

  :deep(.el-button) {
    width: 100%;
    margin-bottom: 10px;
  }

  .status-indicator {
    margin-left: 0;
    margin-top: 5px;
  }
}
</style>
