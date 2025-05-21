import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'

export const useInventoryStore = defineStore('inventory', () => {
  // 商品组合编码与包数的映射关系
  const productCodeToPackages = {
    qklcp1: 1,
    jgcp1: 1,
    sgcp1: 1,
    bkymcp: 1,
    bkqjsy04: 4,
    bkqjy06: 6,
    bkqsy06: 6,
    bkym20: 20,
    bkym4: 4,
    bkym6: 6,
    bkymcp03: 3,
    hhcxzcp03: 3,
    bkymjg06: 6,
    bkymsg06: 6,
    bkysj06: 6,
    jgcp20: 20,
    jgcp3: 3,
    jgcp4: 4,
    jgcp6: 6,
    qkl3jg3: 6,
    qkl3sg3: 6,
    qklcp2: 2,
    qklcp20: 20,
    qklcp3: 3,
    qklcp4: 4,
    qklcp6: 6,
    qkljg3: 3,
    sgcp20: 20,
    sgcp3: 3,
    sgcp4: 4,
    sgcp6: 6,
  }

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
    '款式编码',
    '进出仓类型',
    '仓储方',
    '仓库',
    '数量',
    '关联仓库',
    '备注',
    '原始线上订单号',
    '店铺名称',
    '售后单号',
    '线上订单号',
    '单据标签',
    '快递单号',
  ])

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

  // 获取商品对应的包数
  const getPackageCount = (productCode) => {
    if (!productCode) return 1
    return productCodeToPackages[productCode.toLowerCase()] || 1
  }

  // 读取Excel文件
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

          // 调试信息
          console.log('正在读取Excel工作表:', firstSheetName)

          // 尝试直接转换为JSON，不使用headers指定表头
          const rawJsonData = XLSX.utils.sheet_to_json(worksheet, {
            defval: '', // 默认值为空字符串
            blankrows: false, // 跳过空行
            raw: false, // 返回格式化的值
          })

          console.log('Excel原始数据条数:', rawJsonData.length)
          if (rawJsonData.length > 0) {
            console.log('第一行数据示例:', rawJsonData[0])
            console.log('表头列名:', Object.keys(rawJsonData[0]).join(', '))
          }

          // 设置解析选项，验证是否有效的表头
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
            console.warn('可能的表头不匹配，尝试使用原始数据')
            resolve(rawJsonData) // 如果使用headers提取失败，返回原始数据
            return
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
            console.log('已跳过第一行标题行，处理后数据条数:', finalData.length)
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
      console.log('天猫Excel读取完成，原始数据条数:', data.length)

      // 尝试打印部分数据查看结构
      if (data.length > 0) {
        console.log('天猫数据第一条示例:', data[0])
      }

      // 不进行任何过滤，直接保存所有数据
      tmallData.value = data
      return data
    })
  }

  // 处理仓库Excel文件
  const processWarehouseExcel = (file) => {
    return readExcelFile(file, warehouseHeaders.value).then((data) => {
      console.log('仓库Excel读取完成，原始数据条数:', data.length)

      // 尝试打印部分数据查看结构
      if (data.length > 0) {
        console.log('仓库数据第一条示例:', data[0])
      }

      // 1. 过滤只保留"升升调味品专营店"的数据
      let filteredData = data

      // 只有当店铺名称字段存在时才进行过滤
      if (data.length > 0 && '店铺名称' in data[0]) {
        filteredData = data.filter((item) => item['店铺名称'] === '升升调味品专营店')
        console.log('过滤后仓库数据条数:', filteredData.length)
      } else {
        console.log('仓库数据没有店铺名称字段，不进行店铺过滤')
      }

      // 2. 处理订单号和商品编码
      filteredData.forEach((item) => {
        // 清理订单号
        if (item['线上订单号']) {
          item['线上订单号'] = cleanOrderNumber(item['线上订单号'])
        }

        // 如果有款式编码，添加到商品编码字段以便后续分析使用
        if (item['款式编码'] && !item['商品编码']) {
          item['商品编码'] = item['款式编码']
        }
      })

      warehouseData.value = filteredData
      return filteredData
    })
  }

  // 清空数据
  const clearTmallData = () => {
    tmallData.value = []
  }

  const clearWarehouseData = () => {
    warehouseData.value = []
  }

  // 数据分析
  const analyzeData = () => {
    if (tmallData.value.length === 0 || warehouseData.value.length === 0) {
      return Promise.reject(new Error('天猫数据和仓库数据必须都上传才能进行分析'))
    }

    console.log('--------- 开始数据分析 ---------')
    console.log('天猫数据总条数:', tmallData.value.length)
    console.log('仓库数据总条数:', warehouseData.value.length)

    // 添加样本数据分析
    if (warehouseData.value.length > 0) {
      const sampleItems = warehouseData.value.slice(0, 5) // 取前5条数据作为样本
      console.log('仓库数据样本:')
      sampleItems.forEach((item, index) => {
        console.log(`样本 ${index + 1}:`)
        console.log('  线上订单号:', item['线上订单号'])
        console.log('  进出仓类型:', item['进出仓类型'])
        console.log('  数量:', item['数量'])
        console.log('  款式编码:', item['款式编码'])
      })
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // 创建分析结果对象
          const result = {
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
          }

          // 创建以订单号为键的Map
          const tmallOrderMap = new Map()
          const warehouseOrderMap = new Map()

          // 处理天猫数据
          // 1. 统计天猫订单总量
          for (const item of tmallData.value) {
            // 跳过无效订单数据
            if (!item['主订单编号']) continue

            const orderNumber = String(item['主订单编号']).trim()
            const quantity = Number(item['购买数量']) || 0

            // 使用外部系统编号而不是商家编码来查找包数
            const productCode = item['外部系统编号'] || ''

            // 添加日志输出，检查外部系统编号是否匹配映射表
            if (productCode && !productCodeToPackages[productCode.toLowerCase()]) {
              console.warn(`外部系统编号 "${productCode}" 在映射表中不存在，将使用默认包数 1`)
            }

            const packageCount = getPackageCount(productCode)
            const totalPackages = quantity * packageCount

            // 记录详细日志
            console.log(
              `订单 ${orderNumber} | 商品: ${item['标题'] || '未知'} | 外部系统编号=${productCode}, 购买数量=${quantity}, 包数=${packageCount}, 总包数=${totalPackages}`,
            )

            // 累计总订单数量
            result.tmallTotalQuantity += quantity
            result.tmallTotalPackagesToShip += totalPackages

            // 存储订单信息 - 每个子订单/商品都作为一个独立项
            const subOrderInfo = {
              subOrderId: item['子订单编号'] || '未知',
              orderNumber,
              title: item['标题'] || '未知商品',
              quantity,
              productCode,
              packageCount,
              totalPackages,
              orderStatus: item['订单状态'] || '',
              createTime: item['订单创建时间'] || '',
              payTime: item['订单付款时间'] || '',
              refundStatus: item['退款状态'] || '',
              fullItem: item, // 保存完整的原始数据
            }

            // 存储订单信息
            if (tmallOrderMap.has(orderNumber)) {
              // 如果订单已存在，添加子订单信息
              const existingOrder = tmallOrderMap.get(orderNumber)
              existingOrder.subOrders.push(subOrderInfo)
              existingOrder.quantity += quantity
              existingOrder.packageCount += totalPackages
            } else {
              // 新建订单记录
              tmallOrderMap.set(orderNumber, {
                orderNumber,
                quantity,
                packageCount: totalPackages,
                subOrders: [subOrderInfo],
              })
            }
          }

          // 处理仓库数据
          for (const item of warehouseData.value) {
            // 跳过无效订单数据
            if (!item['线上订单号']) continue

            const orderNumber = String(item['线上订单号']).trim()
            let quantity = Number(item['数量']) || 0

            // 确保出库数量为正数：仓库系统中，负数表示出库（减少库存）
            // 如果数量为负数，取绝对值；如果为正数，可能是入库，应该忽略
            if (quantity < 0) {
              // 负数表示出库，取绝对值计入发货数量
              quantity = Math.abs(quantity)
            } else if (item['进出仓类型'] && item['进出仓类型'].includes('出库')) {
              // 如果明确标记为出库但数量是正数，也计入发货数量
              quantity = Math.abs(quantity)
            } else {
              // 正数且未明确标记为出库，可能是入库，不计入发货量
              quantity = 0
            }

            // 累计总发货数量，只计入实际为出库的记录
            if (quantity > 0) {
              result.warehouseTotalQuantity += quantity
            }

            // 存储订单信息
            if (warehouseOrderMap.has(orderNumber)) {
              // 如果订单已存在，累加数量（只累加出库数量）
              const existingOrder = warehouseOrderMap.get(orderNumber)
              existingOrder.quantity += quantity
              existingOrder.items.push(item)
            } else {
              // 新建订单记录
              warehouseOrderMap.set(orderNumber, {
                orderNumber,
                quantity,
                items: [item],
              })
            }
          }

          // 分析订单
          // 1. 查找两者都存在的订单
          for (const [orderNumber, tmallOrder] of tmallOrderMap.entries()) {
            if (warehouseOrderMap.has(orderNumber)) {
              // 订单在仓库数据中存在
              result.inBoth++

              // 检查数量是否匹配
              const warehouseOrder = warehouseOrderMap.get(orderNumber)
              const tmallPackages = tmallOrder.packageCount
              const warehouseQuantity = warehouseOrder.quantity

              // 允许一定误差范围，比如±2或相差不超过5%
              const absoluteDifference = Math.abs(tmallPackages - warehouseQuantity)
              const relativeDifference = tmallPackages > 0 ? absoluteDifference / tmallPackages : 1
              // 如果绝对差异大于2且相对差异大于5%，才认为是不匹配
              const isMismatch = absoluteDifference > 2 && relativeDifference > 0.05

              if (isMismatch) {
                // 数量不匹配
                // 记录详细的子订单信息，而不是简单的累加量
                const subOrderDetails = tmallOrder.subOrders.map((item) => ({
                  subOrderId: item.subOrderId,
                  title: item.title,
                  quantity: item.quantity,
                  productCode: item.productCode,
                  packageCount: item.packageCount,
                }))

                result.quantityMismatch.push({
                  orderNumber,
                  tmallQuantity: tmallOrder.quantity,
                  tmallPackages,
                  warehouseQuantity,
                  difference: warehouseQuantity - tmallPackages,
                  // 添加子订单详情
                  subOrders: subOrderDetails,
                  // 添加子订单数量
                  subOrderCount: subOrderDetails.length,
                })

                // 计算多发或少发数量
                if (warehouseQuantity > tmallPackages) {
                  result.overShippedQuantity += warehouseQuantity - tmallPackages
                } else {
                  result.underShippedQuantity += tmallPackages - warehouseQuantity
                }
              }
            } else {
              // 订单只在天猫数据中存在
              result.onlyInTmall++
              result.missingInWarehouse.push({
                orderNumber,
                tmallQuantity: tmallOrder.quantity,
                tmallPackages: tmallOrder.packageCount,
                // 提供子订单详情
                subOrders: tmallOrder.subOrders,
                // 使用子订单的原始信息而不是整个订单
                orderInfo: tmallOrder.subOrders[0].fullItem,
              })
            }
          }

          // 2. 查找只在仓库数据中存在的订单
          for (const [orderNumber, warehouseOrder] of warehouseOrderMap.entries()) {
            if (!tmallOrderMap.has(orderNumber)) {
              result.onlyInWarehouse++
              result.missingInTmall.push({
                orderNumber,
                warehouseQuantity: warehouseOrder.quantity,
                orderInfo: warehouseOrder.items[0],
              })
            }
          }

          // 计算净差异
          result.netDifference = result.warehouseTotalQuantity - result.tmallTotalPackagesToShip

          // 结果验证
          console.log('--------- 分析结果验证 ---------')
          console.log('天猫总订单数:', tmallOrderMap.size)
          console.log('仓库总订单数:', warehouseOrderMap.size)
          console.log('同时存在订单数:', result.inBoth)
          console.log('数量不匹配订单数:', result.quantityMismatch.length)
          console.log('天猫购买总数:', result.tmallTotalQuantity)
          console.log('天猫应发包数:', result.tmallTotalPackagesToShip)
          console.log('仓库实际发货总数:', result.warehouseTotalQuantity)
          console.log('差异:', result.netDifference)

          // 如果存在严重问题，输出警告
          if (result.warehouseTotalQuantity <= 0) {
            console.error('严重错误: 仓库发货总数为零或负数，请检查数据处理逻辑')
          }

          if (result.inBoth > 0 && result.quantityMismatch.length === result.inBoth) {
            console.warn('警告: 所有订单都标记为数量不匹配，请检查匹配标准是否合理')
          }

          // 如果差异过大，输出警告
          if (Math.abs(result.netDifference) > result.tmallTotalPackagesToShip * 0.3) {
            // 差异超过30%
            console.warn('警告: 天猫与仓库数据差异过大，请核实数据来源')
          }

          // 返回分析结果
          console.log('分析完成，结果:', result)
          resolve(result)
        } catch (error) {
          console.error('分析数据出错:', error)
          resolve({ error: error.message })
        }
      }, 100) // 延迟100ms，避免UI阻塞
    })
  }

  return {
    tmallData,
    tmallHeaders,
    warehouseData,
    warehouseHeaders,
    productCodeToPackages,
    getPackageCount,
    processTmallExcel,
    processWarehouseExcel,
    clearTmallData,
    clearWarehouseData,
    analyzeData,
  }
})
