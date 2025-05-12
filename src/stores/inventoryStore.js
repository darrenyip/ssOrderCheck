import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'

export const useInventoryStore = defineStore('inventory', () => {
  // 天猫数据
  const tmallData = ref([])
  const tmallHeaders = ref([
    '子订单编号',
    '主订单编号',
    '标题',
    '价格',
    '购买数量',
    '外部系统编号',
    '商品属性',
    '套餐信息',
    '联系方式备注',
    '备注标签',
    '商家备注',
    '订单状态',
    '商家编码',
    '支付单号',
    '买家应付货款',
    '买家实际支付金额',
    '退款状态',
    '退款金额',
    '订单创建时间',
    '订单付款时间',
  ])

  // 仓库数据
  const warehouseData = ref([])
  const warehouseHeaders = ref([
    '进出仓单号',
    '关联单号',
    '进出仓日期',
    '创建人',
    '商品编码',
    '款式编码',
    '历史成本价',
    '商品标签',
    '颜色规格',
    '分类',
    '虚拟分类',
    '供应商',
    '单据供应商',
    '供应商款号',
    '供应商商品编码',
    '品牌',
    '重量',
    '体积',
    '长',
    '宽',
    '高',
    '进出仓类型',
    '仓储方',
    '仓库',
    '数量',
    '单位',
    '关联仓库',
    '备注',
    '明细行备注',
    '仓位',
    '原始线上订单号',
    '店铺名称',
    '售后单号',
    '线上订单号',
    '出仓类型',
    '单据标签',
    '快递单号',
  ])

  // 分析结果
  const analysisResult = ref({
    inBoth: 0, // 同时在两个系统中的订单数
    onlyInTmall: 0, // 只在天猫存在的订单数
    onlyInWarehouse: 0, // 只在仓库系统存在的订单数
    quantityMismatch: [], // 数量不匹配的订单
    missingInTmall: [], // 仓库有记录但天猫没有的订单
    missingInWarehouse: [], // 天猫有记录但仓库没有的订单
  })

  // 分析标志
  const isAnalyzing = ref(false)
  const analysisCompleted = ref(false)

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

  // 优化的Excel文件读取逻辑
  const readExcelFile = (file, headers) => {
    return new Promise((resolve, reject) => {
      if (!file || !(file instanceof Blob)) {
        reject(new Error('无效的文件对象'))
        return
      }

      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          // 获取文件数据
          const data = e.target.result

          // 使用XLSX解析Excel
          const options = {
            type: 'array',
            cellDates: true,
            cellNF: false,
            cellText: false,
          }

          const workbook = XLSX.read(data, options)

          // 确保有工作表
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Excel文件中没有工作表')
          }

          // 获取第一个工作表
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]

          // 设置解析选项
          const jsonOptions = {
            header: headers,
            defval: '', // 默认值为空字符串
            blankrows: false, // 跳过空行
            raw: false, // 返回格式化的值
          }

          // 将Excel转换为JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, jsonOptions)

          // 检查数据
          if (!jsonData || jsonData.length === 0) {
            throw new Error('没有从Excel中获取到数据')
          }

          // 处理数据（跳过可能的标题行）
          let finalData = jsonData

          // 如果第一行看起来像标题（检查第一个字段是否为字符串且包含标题相关文本）
          if (
            jsonData.length > 0 &&
            typeof jsonData[0][headers[0]] === 'string' &&
            (jsonData[0][headers[0]].includes('编号') || jsonData[0][headers[0]].includes('单号'))
          ) {
            finalData = jsonData.slice(1)
          }

          // 返回处理后的数据
          resolve(finalData)
        } catch (error) {
          console.error('解析Excel文件失败:', error)
          reject(error)
        }
      }

      reader.onerror = (error) => {
        console.error('读取文件失败:', error)
        reject(error)
      }

      // 读取文件为ArrayBuffer
      reader.readAsArrayBuffer(file)
    })
  }

  // 处理天猫Excel文件
  const processTmallExcel = (file) => {
    return readExcelFile(file, tmallHeaders.value).then((data) => {
      tmallData.value = data
      return data
    })
  }

  // 处理仓库Excel文件
  const processWarehouseExcel = (file) => {
    return readExcelFile(file, warehouseHeaders.value).then((data) => {
      warehouseData.value = data
      return data
    })
  }

  // 清空数据
  const clearTmallData = () => {
    tmallData.value = []
    // 清空分析结果
    resetAnalysis()
  }

  const clearWarehouseData = () => {
    warehouseData.value = []
    // 清空分析结果
    resetAnalysis()
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
    }
    analysisCompleted.value = false
  }

  // 分析数据
  const analyzeData = () => {
    if (tmallData.value.length === 0 || warehouseData.value.length === 0) {
      return Promise.reject(new Error('天猫数据和仓库数据必须都上传才能进行分析'))
    }

    isAnalyzing.value = true
    resetAnalysis()

    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // 创建订单号索引
          const tmallOrderMap = new Map()
          const warehouseOrderMap = new Map()

          // 按主订单编号聚合天猫数据，计算每个订单的总数量
          tmallData.value.forEach((item) => {
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
              })
            }
          })

          // 按线上订单号聚合仓库数据，计算每个订单的总数量
          warehouseData.value.forEach((item) => {
            if (!item['线上订单号']) return

            const orderNumber = cleanOrderNumber(item['线上订单号'])
            if (!orderNumber) return

            const quantity = parseInt(item['数量']) || 0

            if (warehouseOrderMap.has(orderNumber)) {
              const existing = warehouseOrderMap.get(orderNumber)
              existing.totalQuantity += quantity
              existing.items.push(item)
            } else {
              warehouseOrderMap.set(orderNumber, {
                orderNumber,
                totalQuantity: quantity,
                items: [item],
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
              })
            }
          }

          // 3. 找出数量不匹配的订单
          const quantityMismatch = []
          for (const [orderNumber, tmallOrder] of tmallOrderMap.entries()) {
            if (warehouseOrderMap.has(orderNumber)) {
              const warehouseOrder = warehouseOrderMap.get(orderNumber)
              if (tmallOrder.totalQuantity !== warehouseOrder.totalQuantity) {
                quantityMismatch.push({
                  orderNumber,
                  tmallQuantity: tmallOrder.totalQuantity,
                  warehouseQuantity: warehouseOrder.totalQuantity,
                  difference: warehouseOrder.totalQuantity - tmallOrder.totalQuantity,
                  tmallDetails: tmallOrder.items,
                  warehouseDetails: warehouseOrder.items,
                })
              }
            }
          }

          // 更新分析结果
          analysisResult.value = {
            inBoth: [...tmallOrderMap.keys()].filter((key) => warehouseOrderMap.has(key)).length,
            onlyInTmall: missingInWarehouse.length,
            onlyInWarehouse: missingInTmall.length,
            quantityMismatch,
            missingInTmall,
            missingInWarehouse,
          }

          analysisCompleted.value = true
          resolve(analysisResult.value)
        } catch (error) {
          console.error('分析数据出错:', error)
          resetAnalysis()
          resolve({ error: error.message })
        } finally {
          isAnalyzing.value = false
        }
      }, 100) // 延迟100ms，避免UI阻塞
    })
  }

  return {
    tmallData,
    tmallHeaders,
    warehouseData,
    warehouseHeaders,
    processTmallExcel,
    processWarehouseExcel,
    clearTmallData,
    clearWarehouseData,
    analyzeData,
    analysisResult,
    isAnalyzing,
    analysisCompleted,
    resetAnalysis,
  }
})
