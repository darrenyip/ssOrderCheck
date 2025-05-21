<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useInventoryStore } from '../stores/inventoryStore'
import { UploadFilled, DataAnalysis, Search } from '@element-plus/icons-vue'
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

// 数据展示和查询相关
const showTmallData = ref(false)
const tmallDataToShow = computed(() => {
  if (!tmallSearchQuery.value) {
    return inventoryStore.tmallData.slice(
      (tmallCurrentPage.value - 1) * tmallPageSize.value,
      tmallCurrentPage.value * tmallPageSize.value,
    )
  } else {
    return searchResults.value
  }
})
const tmallCurrentPage = ref(1)
const tmallPageSize = ref(20)
const tmallTotal = computed(() =>
  tmallSearchQuery.value ? searchResults.value.length : inventoryStore.tmallData.length,
)
const tmallSearchQuery = ref('')
const searchResults = ref([])

// 详细分析结果分页相关
const pageSizeForTables = 10 // 每页显示数量

// 数量不匹配订单分页
const mismatchPagination = ref({
  currentPage: 1,
  currentPageData: [],
})

// 仓库缺失订单分页
const missingInWarehousePagination = ref({
  currentPage: 1,
  currentPageData: [],
})

// 天猫缺失订单分页
const missingInTmallPagination = ref({
  currentPage: 1,
  currentPageData: [],
})

// 分页数据处理函数
const updateMismatchPageData = () => {
  const start = (mismatchPagination.value.currentPage - 1) * pageSizeForTables
  const end = start + pageSizeForTables
  mismatchPagination.value.currentPageData = analysisResult.value.quantityMismatch.slice(start, end)
}

const updateMissingInWarehousePageData = () => {
  const start = (missingInWarehousePagination.value.currentPage - 1) * pageSizeForTables
  const end = start + pageSizeForTables
  missingInWarehousePagination.value.currentPageData =
    analysisResult.value.missingInWarehouse.slice(start, end)
}

const updateMissingInTmallPageData = () => {
  const start = (missingInTmallPagination.value.currentPage - 1) * pageSizeForTables
  const end = start + pageSizeForTables
  missingInTmallPagination.value.currentPageData = analysisResult.value.missingInTmall.slice(
    start,
    end,
  )
}

// 分页切换处理函数
const changeMismatchPage = (page) => {
  mismatchPagination.value.currentPage = page
  updateMismatchPageData()
}

const changeMissingInWarehousePage = (page) => {
  missingInWarehousePagination.value.currentPage = page
  updateMissingInWarehousePageData()
}

const changeMissingInTmallPage = (page) => {
  missingInTmallPagination.value.currentPage = page
  updateMissingInTmallPageData()
}

// 获取商品对应的包数
const getPackageCount = (productCode) => {
  if (!productCode) return 1
  return inventoryStore.getPackageCount(productCode)
}

// 天猫数据搜索
const searchTmallData = () => {
  if (!tmallSearchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  const query = tmallSearchQuery.value.trim().toLowerCase()
  searchResults.value = inventoryStore.tmallData.filter((item) => {
    if (item['主订单编号']) {
      const orderNumber = String(item['主订单编号']).toLowerCase()
      return orderNumber.includes(query)
    }
    return false
  })

  tmallCurrentPage.value = 1
}

// 切换显示天猫数据
const toggleTmallDataDisplay = () => {
  showTmallData.value = !showTmallData.value
  if (showTmallData.value) {
    tmallCurrentPage.value = 1
    tmallSearchQuery.value = ''
    searchResults.value = []
  }
}

// 分页改变回调
const handleTmallPageChange = (page) => {
  tmallCurrentPage.value = page
}

// 数据分析变量
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
  tmallTotalPackagesToShip: 0,
  warehouseTotalQuantity: 0,
  overShippedQuantity: 0,
  underShippedQuantity: 0,
  netDifference: 0,
})

// 数据分析
const runAnalysis = () => {
  if (inventoryStore.tmallData.length === 0 || inventoryStore.warehouseData.length === 0) {
    ElMessage.warning('请先上传天猫数据和仓库数据')
    return
  }

  // 重置状态
  isAnalyzing.value = true

  // 重置分页
  mismatchPagination.value.currentPage = 1
  missingInWarehousePagination.value.currentPage = 1
  missingInTmallPagination.value.currentPage = 1

  // 调用inventory store中的数据分析方法
  inventoryStore
    .analyzeData()
    .then((result) => {
      if (result.error) {
        ElMessage.error(`分析出错: ${result.error}`)
      } else {
        analysisCompleted.value = true
        // 将结果复制到本地状态
        Object.assign(analysisResult.value, result)
        // 初始化分页数据
        updateMismatchPageData()
        updateMissingInWarehousePageData()
        updateMissingInTmallPageData()
        ElMessage.success('数据分析完成')
      }
    })
    .catch((error) => {
      ElMessage.error(`分析出错: ${error.message || '未知错误'}`)
    })
    .finally(() => {
      isAnalyzing.value = false
    })
}

// 从store获取数据
const tmallData = computed(() => inventoryStore.tmallData)
const warehouseData = computed(() => inventoryStore.warehouseData)
// 获取产品映射
const productCodeToPackages = computed(() => inventoryStore.productCodeToPackages)

// 清空数据
const clearTmallData = () => {
  inventoryStore.clearTmallData()
  tmallFileList.value = []
  tmallStatus.value = '数据已清空'
  analysisCompleted.value = false
  showTmallData.value = false
  tmallSearchQuery.value = ''
  searchResults.value = []
  ElMessage.success('天猫数据已清空')
}

const clearWarehouseData = () => {
  inventoryStore.clearWarehouseData()
  warehouseFileList.value = []
  warehouseStatus.value = '数据已清空'
  analysisCompleted.value = false
  ElMessage.success('仓库数据已清空')
}

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
        showTmallData.value = true
        tmallCurrentPage.value = 1
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

        <el-button v-if="tmallData.length > 0" @click="toggleTmallDataDisplay" type="primary" plain>
          {{ showTmallData ? '隐藏数据表格' : '显示数据表格' }}
        </el-button>

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

      <!-- 天猫数据表格 -->
      <div v-if="showTmallData && tmallData.length > 0" class="data-table-container">
        <div class="search-bar">
          <el-input
            v-model="tmallSearchQuery"
            placeholder="输入主订单编号搜索"
            clearable
            @input="searchTmallData"
            style="width: 300px"
          >
            <template #append>
              <el-button @click="searchTmallData">
                <el-icon><Search /></el-icon>
              </el-button>
            </template>
          </el-input>
          <span v-if="searchResults.length > 0" class="search-result-info">
            找到 {{ searchResults.length }} 条匹配记录
          </span>
        </div>

        <el-table :data="tmallDataToShow" border style="width: 100%" max-height="500" stripe>
          <el-table-column prop="主订单编号" label="主订单编号" width="180" />
          <el-table-column prop="子订单编号" label="子订单编号" width="180" />
          <el-table-column prop="标题" label="商品标题" min-width="220" />
          <el-table-column prop="购买数量" label="购买数量" width="100" />
          <el-table-column prop="商家编码" label="商家编码" width="140" />
          <el-table-column label="应发包数" width="100">
            <template #default="scope">
              <span>
                {{
                  scope.row['外部系统编号']
                    ? scope.row['购买数量'] * getPackageCount(scope.row['外部系统编号'])
                    : scope.row['购买数量']
                }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="订单状态" label="订单状态" width="120" />
          <el-table-column prop="订单创建时间" label="创建时间" width="180" />
          <el-table-column prop="订单付款时间" label="付款时间" width="180" />
        </el-table>

        <div class="pagination-container">
          <el-pagination
            v-model:current-page="tmallCurrentPage"
            :page-size="tmallPageSize"
            :total="tmallTotal"
            layout="total, prev, pager, next, jumper"
            @current-change="handleTmallPageChange"
          />
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
            <div class="stat-label">仅在天猫存在</div>
            <div class="stat-value">{{ analysisResult.onlyInTmall }} 个订单</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">仅在仓库存在</div>
            <div class="stat-value">{{ analysisResult.onlyInWarehouse }} 个订单</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">数量不匹配</div>
            <div class="stat-value">{{ analysisResult.quantityMismatch.length }} 个订单</div>
          </div>
        </div>

        <div class="stats-summary">
          <div class="stat-item">
            <div class="stat-label">天猫购买总数</div>
            <div class="stat-value">{{ analysisResult.tmallTotalQuantity }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">天猫应发包数</div>
            <div class="stat-value">{{ analysisResult.tmallTotalPackagesToShip }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">仓库发货总数</div>
            <div class="stat-value">{{ analysisResult.warehouseTotalQuantity }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">差异</div>
            <div
              class="stat-value"
              :class="analysisResult.netDifference > 0 ? 'text-danger' : 'text-warning'"
            >
              {{ analysisResult.netDifference }}
            </div>
          </div>
        </div>

        <h2 class="section-title-special">
          <span class="line"></span>
          <span class="title-text">详细分析结果</span>
          <span class="line"></span>
        </h2>

        <!-- 数量不匹配订单 -->
        <div class="result-section">
          <h3 class="result-title">
            数量不匹配订单 ({{ analysisResult.quantityMismatch.length }})
          </h3>
          <div v-if="analysisResult.quantityMismatch.length === 0" class="empty-result">
            没有发现数量不匹配的订单
          </div>
          <el-table
            v-else
            :data="mismatchPagination.currentPageData"
            border
            style="width: 100%"
            max-height="500"
            stripe
          >
            <el-table-column prop="orderNumber" label="订单号" width="180" />
            <el-table-column prop="tmallQuantity" label="天猫总购买量" width="120" />
            <el-table-column prop="tmallPackages" label="应发总包数" width="120" />
            <el-table-column prop="warehouseQuantity" label="实际发货数" width="120" />
            <el-table-column label="差异" width="120">
              <template #default="scope">
                <span
                  :class="
                    scope.row.difference > 0
                      ? 'text-danger'
                      : scope.row.difference < 0
                        ? 'text-warning'
                        : ''
                  "
                >
                  {{ scope.row.difference > 0 ? '+' : '' }}{{ scope.row.difference }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="子订单详情" min-width="300">
              <template #default="scope">
                <div v-if="scope.row.subOrders && scope.row.subOrders.length > 0">
                  <div
                    v-for="(subOrder, index) in scope.row.subOrders"
                    :key="index"
                    class="sub-order-info"
                  >
                    <div>
                      <strong>子订单{{ index + 1 }}:</strong> {{ subOrder.subOrderId }}
                    </div>
                    <div>商品: {{ subOrder.title }}</div>
                    <div>
                      数量: {{ subOrder.quantity }}件 (应发{{
                        subOrder.quantity * subOrder.packageCount
                      }}包)
                    </div>
                    <div>
                      商品编码: {{ subOrder.productCode }} (每件{{ subOrder.packageCount }}包)
                    </div>
                    <el-divider v-if="index < scope.row.subOrders.length - 1" />
                  </div>
                </div>
                <div v-else class="empty-details">无子订单详情</div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="analysisResult.quantityMismatch.length > 0" class="pagination-container">
            <el-pagination
              v-model:current-page="mismatchPagination.currentPage"
              :page-size="pageSizeForTables"
              :total="analysisResult.quantityMismatch.length"
              layout="total, prev, pager, next, jumper"
              @current-change="changeMismatchPage"
            />
          </div>
        </div>

        <!-- 仓库缺失订单 -->
        <div class="result-section">
          <h3 class="result-title">
            仓库缺失订单 ({{ analysisResult.missingInWarehouse.length }})
          </h3>
          <div v-if="analysisResult.missingInWarehouse.length === 0" class="empty-result">
            没有发现仓库缺失的订单
          </div>
          <el-table
            v-else
            :data="missingInWarehousePagination.currentPageData"
            border
            style="width: 100%"
            max-height="500"
            stripe
          >
            <el-table-column prop="orderNumber" label="订单号" width="180" />
            <el-table-column prop="tmallQuantity" label="天猫总购买量" width="120" />
            <el-table-column prop="tmallPackages" label="应发总包数" width="120" />
            <el-table-column label="子订单详情" min-width="300">
              <template #default="scope">
                <div v-if="scope.row.subOrders && scope.row.subOrders.length > 0">
                  <div
                    v-for="(subOrder, index) in scope.row.subOrders"
                    :key="index"
                    class="sub-order-info"
                  >
                    <div>
                      <strong>子订单{{ index + 1 }}:</strong> {{ subOrder.subOrderId }}
                    </div>
                    <div>商品: {{ subOrder.title }}</div>
                    <div>数量: {{ subOrder.quantity }}件 (应发{{ subOrder.totalPackages }}包)</div>
                    <div>商品编码: {{ subOrder.productCode }}</div>
                    <div>订单状态: {{ subOrder.orderStatus }}</div>
                    <el-divider v-if="index < scope.row.subOrders.length - 1" />
                  </div>
                </div>
                <div v-else class="empty-details">无子订单详情</div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="analysisResult.missingInWarehouse.length > 0" class="pagination-container">
            <el-pagination
              v-model:current-page="missingInWarehousePagination.currentPage"
              :page-size="pageSizeForTables"
              :total="analysisResult.missingInWarehouse.length"
              layout="total, prev, pager, next, jumper"
              @current-change="changeMissingInWarehousePage"
            />
          </div>
        </div>

        <!-- 天猫缺失订单 -->
        <div class="result-section">
          <h3 class="result-title">天猫缺失订单 ({{ analysisResult.missingInTmall.length }})</h3>
          <div v-if="analysisResult.missingInTmall.length === 0" class="empty-result">
            没有发现天猫缺失的订单
          </div>
          <el-table
            v-else
            :data="missingInTmallPagination.currentPageData"
            border
            style="width: 100%"
            max-height="500"
            stripe
          >
            <el-table-column prop="orderNumber" label="订单号" width="180" />
            <el-table-column prop="warehouseQuantity" label="仓库发货数量" width="120" />
            <el-table-column label="发货信息" min-width="250">
              <template #default="scope">
                <div class="order-info">
                  <div>进出仓单号: {{ scope.row.orderInfo['进出仓单号'] }}</div>
                  <div>进出仓日期: {{ scope.row.orderInfo['进出仓日期'] }}</div>
                  <div>款式编码: {{ scope.row.orderInfo['款式编码'] }}</div>
                  <div>进出仓类型: {{ scope.row.orderInfo['进出仓类型'] }}</div>
                  <div>仓库: {{ scope.row.orderInfo['仓库'] }}</div>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="analysisResult.missingInTmall.length > 0" class="pagination-container">
            <el-pagination
              v-model:current-page="missingInTmallPagination.currentPage"
              :page-size="pageSizeForTables"
              :total="analysisResult.missingInTmall.length"
              layout="total, prev, pager, next, jumper"
              @current-change="changeMissingInTmallPage"
            />
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
  padding: 20px 0;
  background-color: #f5f7fa;
  border-radius: 4px;
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

.text-muted {
  color: #909399;
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
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.result-title {
  font-size: 1.1rem;
  color: #303133;
  margin-bottom: 20px;
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

.data-table-container {
  margin-top: 20px;
  background-color: #fff;
  border-radius: 4px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.search-bar {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.search-result-info {
  color: #409eff;
  font-weight: 500;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.detail-header-item {
  display: flex;
  flex-direction: column;
}

.label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 5px;
}

.value {
  font-size: 16px;
  color: #303133;
  font-weight: 500;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 5px;
}

.exchange {
  background-color: #f56c6c;
  color: #fff;
}

.old-order {
  background-color: #e6a23c;
  color: #fff;
}

.other-platform {
  background-color: #67c23a;
  color: #fff;
}

.unknown {
  background-color: #909399;
  color: #fff;
}

.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.highlight-warning {
  background-color: #fdf6ec;
  color: #e6a23c;
  padding: 10px 15px;
  border-radius: 4px;
  border-left: 4px solid #e6a23c;
  font-weight: bold;
  margin-bottom: 20px;
}

.analysis-tabs {
  margin-top: 20px;
}

.order-info {
  display: flex;
  flex-direction: column;
}

.sub-order-info {
  padding: 8px 0;
  font-size: 13px;
  line-height: 1.4;
}

.sub-order-info div {
  margin-bottom: 4px;
}

.sub-order-info strong {
  color: #409eff;
}

.empty-details {
  color: #909399;
  font-style: italic;
  padding: 10px 0;
}
</style>
