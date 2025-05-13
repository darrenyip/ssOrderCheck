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
  missingInTmallAnalysis: {
    possibleOtherPlatform: [],
    possibleExchange: [],
    possibleOldOrder: [],
    unknown: [],
  },
  timeAnalysis: {
    monthlyMissingCount: [],
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

  // 使用setTimeout避免UI阻塞
  setTimeout(() => {
    try {
      // 创建订单号索引
      const tmallOrderMap = new Map()
      const warehouseOrderMap = new Map()

      // 按主订单编号聚合天猫数据，计算每个订单的总数量
      inventoryStore.tmallData.forEach((item) => {
        if (!item['主订单编号']) return

        const orderNumber = cleanOrderNumber(item['主订单编号'])
        if (!orderNumber) return

        const quantity = parseInt(item['购买数量']) || 0

        if (tmallOrderMap.has(orderNumber)) {
          const existing = tmallOrderMap.get(orderNumber)
          existing.totalQuantity += quantity
          existing.items.push(item)
        } else {
          tmallOrderMap.set(orderNumber, {
            orderNumber,
            totalQuantity: quantity,
            items: [item],
            // 记录订单时间信息
            orderTime: item['订单创建时间'] || '',
            paymentTime: item['订单付款时间'] || '',
            status: item['订单状态'] || '',
          })
        }
      })

      // 按线上订单号聚合仓库数据，计算每个订单的总数量
      inventoryStore.warehouseData.forEach((item) => {
        if (!item['线上订单号']) return

        const orderNumber = item['线上订单号'] // 仓库数据的订单号在store中已清理
        if (!orderNumber) return

        // 获取数量并取绝对值，因为仓库发货记录是负数
        const rawQuantity = parseInt(item['数量']) || 0
        const quantity = Math.abs(rawQuantity)

        if (warehouseOrderMap.has(orderNumber)) {
          const existing = warehouseOrderMap.get(orderNumber)
          existing.totalQuantity += quantity
          existing.items.push(item)
        } else {
          warehouseOrderMap.set(orderNumber, {
            orderNumber,
            totalQuantity: quantity,
            items: [item],
            // 记录仓库发货时间和类型
            shipDate: item['进出仓日期'] || '',
            shipType: item['出仓类型'] || '',
            expressNo: item['快递单号'] || '',
            relatedOrderNo: item['关联单号'] || '',
          })
        }
      })

      // 比较两个数据源
      // 1. 找出仓库有记录但天猫没有的订单
      const missingInTmall = []
      for (const [orderNumber, warehouseOrder] of warehouseOrderMap.entries()) {
        if (!tmallOrderMap.has(orderNumber)) {
          missingInTmall.push({
            orderNumber,
            quantity: warehouseOrder.totalQuantity,
            warehouseDetails: warehouseOrder.items,
            // 添加分析用的额外信息
            shipDate: warehouseOrder.shipDate,
            shipType: warehouseOrder.shipType,
            expressNo: warehouseOrder.expressNo,
            relatedOrderNo: warehouseOrder.relatedOrderNo,
          })
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
            // 添加分析用的额外信息
            orderTime: tmallOrder.orderTime,
            paymentTime: tmallOrder.paymentTime,
            status: tmallOrder.status,
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
              // 添加更多信息便于分析
              orderTime: tmallOrder.orderTime,
              paymentTime: tmallOrder.paymentTime,
              shipDate: warehouseOrder.shipDate,
              status: tmallOrder.status,
            })
          }
        }
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

      // 分析仓库多出订单的可能原因
      const missingInTmallAnalysis = analyzeWarehouseExtraOrders(missingInTmall)

      // 分析时间分布
      const timeAnalysis = analyzeTimeTrend(tmallOrderMap, warehouseOrderMap, missingInTmall)

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
        // 新增的高级分析结果
        missingInTmallAnalysis,
        timeAnalysis,
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

// 分析仓库多出订单的可能原因
const analyzeWarehouseExtraOrders = (missingInTmall) => {
  const result = {
    // 可能是其他平台订单
    possibleOtherPlatform: [],
    // 可能是换货单
    possibleExchange: [],
    // 可能是天猫数据缺失(时间较早的订单)
    possibleOldOrder: [],
    // 未知原因
    unknown: [],
  }

  missingInTmall.forEach((order) => {
    // 检查是否有关联单号，可能是换货单
    if (order.relatedOrderNo && order.relatedOrderNo.trim() !== '') {
      result.possibleExchange.push(order)
      return
    }

    // 检查订单号格式，不是常规数字格式可能是其他平台
    if (!/^\d+$/.test(order.orderNumber)) {
      result.possibleOtherPlatform.push(order)
      return
    }

    // 根据发货日期判断是否可能是较早的订单(超过3个月)
    const shipDate = order.shipDate ? new Date(order.shipDate) : null
    if (shipDate) {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

      if (shipDate < threeMonthsAgo) {
        result.possibleOldOrder.push(order)
        return
      }
    }

    // 其他未知原因
    result.unknown.push(order)
  })

  return result
}

// 分析时间趋势
const analyzeTimeTrend = (tmallOrderMap, warehouseOrderMap, missingInTmall) => {
  // 按月份分组统计缺失订单数量
  const monthlyMissingCount = {}

  missingInTmall.forEach((order) => {
    if (!order.shipDate) return

    try {
      const date = new Date(order.shipDate)
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`

      if (!monthlyMissingCount[monthKey]) {
        monthlyMissingCount[monthKey] = {
          count: 0,
          quantity: 0,
          month: monthKey,
        }
      }

      monthlyMissingCount[monthKey].count++
      monthlyMissingCount[monthKey].quantity += order.quantity
    } catch (e) {
      console.error('日期格式错误:', order.shipDate, e)
    }
  })

  return {
    monthlyMissingCount: Object.values(monthlyMissingCount).sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
  }
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
    // 新增的高级分析结果
    missingInTmallAnalysis: {
      possibleOtherPlatform: [],
      possibleExchange: [],
      possibleOldOrder: [],
      unknown: [],
    },
    timeAnalysis: {
      monthlyMissingCount: [],
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
      订单时间: item.orderTime || '',
      付款时间: item.paymentTime || '',
      发货时间: item.shipDate || '',
      订单状态: item.status || '',
    }))

    // 准备缺失订单数据
    const missingInTmallData = analysisResult.value.missingInTmall.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      仓库数量: item.quantity,
      天猫状态: '缺失',
      备注: '仓库有发货记录，天猫无订单记录',
      发货日期: item.shipDate || '',
      发货类型: item.shipType || '',
      快递单号: item.expressNo || '',
      关联单号: item.relatedOrderNo || '',
    }))

    const missingInWarehouseData = analysisResult.value.missingInWarehouse.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      天猫数量: item.quantity,
      仓库状态: '缺失',
      备注: '天猫有订单记录，仓库无发货记录',
      订单创建时间: item.orderTime || '',
      订单付款时间: item.paymentTime || '',
      订单状态: item.status || '',
    }))

    // 新增：售后换货单分析数据
    const exchangeOrdersData = analysisResult.value.missingInTmallAnalysis.possibleExchange.map(
      (item) => ({
        订单号: formatOrderNumber(item.orderNumber),
        关联单号: item.relatedOrderNo || '',
        发货数量: item.quantity,
        发货日期: item.shipDate || '',
        发货类型: item.shipType || '',
        快递单号: item.expressNo || '',
        分析结论: '可能是售后换货订单',
      }),
    )

    // 新增：可能来自其他平台的订单
    const otherPlatformOrdersData =
      analysisResult.value.missingInTmallAnalysis.possibleOtherPlatform.map((item) => ({
        订单号: formatOrderNumber(item.orderNumber),
        发货数量: item.quantity,
        发货日期: item.shipDate || '',
        发货类型: item.shipType || '',
        分析结论: '可能来自其他平台',
      }))

    // 新增：可能是较早订单
    const oldOrdersData = analysisResult.value.missingInTmallAnalysis.possibleOldOrder.map(
      (item) => ({
        订单号: formatOrderNumber(item.orderNumber),
        发货数量: item.quantity,
        发货日期: item.shipDate || '',
        发货类型: item.shipType || '',
        分析结论: '可能是较早订单(超过3个月)',
      }),
    )

    // 新增：未知原因订单
    const unknownOrdersData = analysisResult.value.missingInTmallAnalysis.unknown.map((item) => ({
      订单号: formatOrderNumber(item.orderNumber),
      发货数量: item.quantity,
      发货日期: item.shipDate || '',
      分析结论: '原因未知',
    }))

    // 新增：按月份统计
    const monthlyAnalysisData = analysisResult.value.timeAnalysis.monthlyMissingCount.map(
      (item) => ({
        月份: item.month,
        订单数量: item.count,
        商品总数: item.quantity,
        占比: `${Math.round((item.count / analysisResult.value.missingInTmall.length) * 100)}%`,
      }),
    )

    // 创建工作簿
    const wb = XLSX.utils.book_new()

    // 添加汇总工作表
    const summaryData = [
      { 项目: '天猫订单总数', 数量: tmallData.value.length },
      { 项目: '仓库记录总数', 数量: warehouseData.value.length },
      { 项目: '天猫商品总数', 数量: analysisResult.value.tmallTotalQuantity },
      { 项目: '仓库发货总数', 数量: analysisResult.value.warehouseTotalQuantity },
      { 项目: '仓库多发总数', 数量: analysisResult.value.overShippedQuantity },
      { 项目: '仓库少发总数', 数量: analysisResult.value.underShippedQuantity },
      {
        项目: '净差异',
        数量: analysisResult.value.netDifference,
        备注: analysisResult.value.netDifference > 0 ? '总体多发' : '总体少发',
      },
      { 项目: '同时存在的订单', 数量: analysisResult.value.inBoth },
      { 项目: '仅天猫存在的订单', 数量: analysisResult.value.onlyInTmall },
      { 项目: '仅仓库存在的订单', 数量: analysisResult.value.onlyInWarehouse },
      { 项目: '数量不匹配的订单', 数量: analysisResult.value.quantityMismatch.length },
      {
        项目: '疑似售后换货订单',
        数量: analysisResult.value.missingInTmallAnalysis.possibleExchange.length,
      },
      {
        项目: '疑似其他平台订单',
        数量: analysisResult.value.missingInTmallAnalysis.possibleOtherPlatform.length,
      },
      {
        项目: '疑似较早订单',
        数量: analysisResult.value.missingInTmallAnalysis.possibleOldOrder.length,
      },
      { 项目: '原因未知订单', 数量: analysisResult.value.missingInTmallAnalysis.unknown.length },
    ]

    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, '分析汇总')

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

    // 添加高级分析工作表

    // 售后换货单
    if (exchangeOrdersData.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(exchangeOrdersData)
      XLSX.utils.book_append_sheet(wb, ws4, '可能的售后换货单')
    }

    // 其他平台订单
    if (otherPlatformOrdersData.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(otherPlatformOrdersData)
      XLSX.utils.book_append_sheet(wb, ws5, '可能的其他平台订单')
    }

    // 较早订单
    if (oldOrdersData.length > 0) {
      const ws6 = XLSX.utils.json_to_sheet(oldOrdersData)
      XLSX.utils.book_append_sheet(wb, ws6, '可能的较早订单')
    }

    // 未知原因
    if (unknownOrdersData.length > 0) {
      const ws7 = XLSX.utils.json_to_sheet(unknownOrdersData)
      XLSX.utils.book_append_sheet(wb, ws7, '原因未知订单')
    }

    // 月度统计
    if (monthlyAnalysisData.length > 0) {
      const ws8 = XLSX.utils.json_to_sheet(monthlyAnalysisData)
      XLSX.utils.book_append_sheet(wb, ws8, '月度分布统计')
    }

    // 导出文件
    XLSX.writeFile(wb, '订单差异分析结果.xlsx')

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

        <!-- 新增：仓库多出订单原因分析 -->
        <div class="result-section" v-if="analysisResult.missingInTmall.length > 0">
          <h3 class="result-title">仓库多出订单原因分析</h3>
          <div class="advanced-analysis">
            <div class="stats-summary cause-summary">
              <div
                class="stat-item"
                v-if="analysisResult.missingInTmallAnalysis.possibleExchange.length > 0"
              >
                <div class="stat-label">
                  <el-tooltip
                    content="存在关联单号的订单，可能是换货、退货等售后订单"
                    placement="top"
                    effect="light"
                  >
                    <span class="tooltip-label">可能是售后换货单</span>
                  </el-tooltip>
                </div>
                <div class="stat-value">
                  {{ analysisResult.missingInTmallAnalysis.possibleExchange.length }} 个订单
                </div>
              </div>

              <div
                class="stat-item"
                v-if="analysisResult.missingInTmallAnalysis.possibleOtherPlatform.length > 0"
              >
                <div class="stat-label">
                  <el-tooltip
                    content="订单号格式与天猫常规格式不符，可能来自其他销售平台"
                    placement="top"
                    effect="light"
                  >
                    <span class="tooltip-label">可能来自其他平台</span>
                  </el-tooltip>
                </div>
                <div class="stat-value">
                  {{ analysisResult.missingInTmallAnalysis.possibleOtherPlatform.length }} 个订单
                </div>
              </div>

              <div
                class="stat-item"
                v-if="analysisResult.missingInTmallAnalysis.possibleOldOrder.length > 0"
              >
                <div class="stat-label">
                  <el-tooltip
                    content="订单发货日期较早（超过3个月），可能是天猫数据缺失的历史订单"
                    placement="top"
                    effect="light"
                  >
                    <span class="tooltip-label">可能是较早订单</span>
                  </el-tooltip>
                </div>
                <div class="stat-value">
                  {{ analysisResult.missingInTmallAnalysis.possibleOldOrder.length }} 个订单
                </div>
              </div>

              <div
                class="stat-item"
                v-if="analysisResult.missingInTmallAnalysis.unknown.length > 0"
              >
                <div class="stat-label">
                  <el-tooltip
                    content="无法确定原因的订单，需要进一步核实"
                    placement="top"
                    effect="light"
                  >
                    <span class="tooltip-label">原因未知</span>
                  </el-tooltip>
                </div>
                <div class="stat-value">
                  {{ analysisResult.missingInTmallAnalysis.unknown.length }} 个订单
                </div>
              </div>
            </div>

            <!-- 售后换货单详细列表 -->
            <div
              class="detail-section"
              v-if="analysisResult.missingInTmallAnalysis.possibleExchange.length > 0"
            >
              <h4 class="detail-title">
                <el-tooltip
                  content="这些订单存在关联单号，可能是因换货而产生的发货记录"
                  placement="top"
                  effect="light"
                >
                  <span
                    >可能的售后换货单 ({{
                      analysisResult.missingInTmallAnalysis.possibleExchange.length
                    }})</span
                  >
                </el-tooltip>
              </h4>
              <el-table
                :data="analysisResult.missingInTmallAnalysis.possibleExchange.slice(0, 20)"
                border
                style="width: 100%"
                max-height="250"
                size="small"
              >
                <el-table-column prop="orderNumber" label="订单号" width="180" />
                <el-table-column prop="relatedOrderNo" label="关联单号" width="180" />
                <el-table-column prop="quantity" label="发货数量" width="100" />
                <el-table-column prop="shipDate" label="发货日期" width="120" />
              </el-table>
              <div
                v-if="analysisResult.missingInTmallAnalysis.possibleExchange.length > 20"
                class="more-data-hint"
              >
                仅显示前20条记录，完整数据请导出Excel
              </div>
            </div>

            <!-- 其他平台订单 -->
            <div
              class="detail-section"
              v-if="analysisResult.missingInTmallAnalysis.possibleOtherPlatform.length > 0"
            >
              <h4 class="detail-title">
                <el-tooltip
                  content="这些订单号格式与天猫常规订单不同，可能来自其他销售平台"
                  placement="top"
                  effect="light"
                >
                  <span
                    >可能来自其他平台的订单 ({{
                      analysisResult.missingInTmallAnalysis.possibleOtherPlatform.length
                    }})</span
                  >
                </el-tooltip>
              </h4>
              <el-table
                :data="analysisResult.missingInTmallAnalysis.possibleOtherPlatform.slice(0, 20)"
                border
                style="width: 100%"
                max-height="250"
                size="small"
              >
                <el-table-column prop="orderNumber" label="订单号" width="180" />
                <el-table-column prop="quantity" label="发货数量" width="100" />
                <el-table-column prop="shipDate" label="发货日期" width="120" />
              </el-table>
              <div
                v-if="analysisResult.missingInTmallAnalysis.possibleOtherPlatform.length > 20"
                class="more-data-hint"
              >
                仅显示前20条记录，完整数据请导出Excel
              </div>
            </div>
          </div>
        </div>

        <!-- 新增：时间趋势分析 -->
        <div
          class="result-section"
          v-if="analysisResult.timeAnalysis.monthlyMissingCount.length > 0"
        >
          <h3 class="result-title">缺失订单时间趋势分析</h3>
          <div class="time-analysis">
            <p class="analysis-intro">
              以下是仓库多出订单的月度分布情况，可能有助于确定数据缺失的时间规律：
            </p>
            <el-table
              :data="analysisResult.timeAnalysis.monthlyMissingCount"
              border
              style="width: 100%"
              max-height="300"
            >
              <el-table-column prop="month" label="月份" width="120" />
              <el-table-column prop="count" label="订单数量" width="100" />
              <el-table-column prop="quantity" label="商品总数" width="100" />
              <el-table-column label="订单比例" min-width="140">
                <template #default="scope">
                  {{ Math.round((scope.row.count / analysisResult.missingInTmall.length) * 100) }}%
                </template>
              </el-table-column>
            </el-table>
          </div>
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

/* 自定义折叠面板样式 */
:deep(.el-collapse) {
  border: none;
  --el-collapse-header-height: auto;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
}

:deep(.el-collapse-item__header) {
  padding: 15px 0 10px;
  font-size: 1.2rem;
  color: #303133;
  font-weight: normal;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

:deep(.el-collapse-item__arrow) {
  margin-right: 10px;
}

:deep(.el-collapse-item__wrap) {
  border: none;
}

:deep(.el-collapse-item__content) {
  padding: 10px 0 15px 14px;
}

:deep(.el-collapse-item__header .tooltip-label) {
  border-bottom: none;
  display: inline-block;
  margin-right: 5px;
}

:deep(.el-collapse-item__header .el-tooltip) {
  display: inline-block;
  max-width: calc(100% - 50px);
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

.detail-title {
  font-size: 1rem;
  color: #606266;
  margin: 15px 0 10px;
  font-weight: normal;
}

.detail-section {
  margin-bottom: 25px;
}

.advanced-analysis {
  background-color: #f8f9fa;
  border-radius: 6px;
  padding: 15px;
  margin-top: 10px;
}

.cause-summary {
  margin-bottom: 20px;
}

.analysis-intro {
  margin-bottom: 15px;
  color: #606266;
}

.time-analysis {
  margin-top: 10px;
}
</style>
