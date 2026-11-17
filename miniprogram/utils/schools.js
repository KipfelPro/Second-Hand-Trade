// 天津大学官网「学院（部）」目录。保留学部入口及其列出的学院。
const colleges = [
  '机械工程学院', '精密仪器与光电子工程学院', '电气自动化与信息工程学院', '微电子学院',
  '智能与计算学部', '计算机科学与技术学院', '网络安全学院', '人工智能学院', '软件学院',
  '建筑工程学院', '建筑学院', '化工学院', '合成生物与生物制造学院', '材料科学与工程学院',
  '环境科学与工程学院', '管理与经济学部', '人文艺术学院', '外国语学院', '法学院', '纪检监察学院',
  '马克思主义学院', '理学院', '数学学院', '医学部', '医学院', '药物科学与技术学院', '生命科学学院',
  '卫生应急学院', '海洋科学与技术学院', '地球系统科学学院', '能源学院', '未来技术学院', '宣怀学院',
  '国家卓越工程师学院', '国际工程师学院', '教育学院', '国际教育学院', '新媒体与传播学院',
  '分子+研究院', '分子聚集态科学研究院'
]
const grades = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士']
const divisions = {
  '智能与计算学部': ['计算机科学与技术学院', '网络安全学院', '人工智能学院', '软件学院'],
  '医学部': ['医学院', '药物科学与技术学院', '生命科学学院', '卫生应急学院']
}

// 以校级院系目录为名录，以研招联系表和就业生源所在校区为常用归属。
// 已公开跨校区培养的项目列入两处，避免用招生办公室地址推断所有学生。
const bothCampuses = ['beiyang', 'weijin']
const campusByCollege = {
  '机械工程学院': ['beiyang'],
  '精密仪器与光电子工程学院': ['weijin'],
  '电气自动化与信息工程学院': ['weijin'],
  '微电子学院': ['weijin'],
  '智能与计算学部': ['beiyang'],
  '计算机科学与技术学院': ['beiyang'],
  '网络安全学院': ['beiyang'],
  '人工智能学院': ['beiyang'],
  '软件学院': ['beiyang'],
  '建筑工程学院': ['beiyang'],
  '建筑学院': ['weijin'],
  '化工学院': ['beiyang'],
  '合成生物与生物制造学院': ['beiyang'],
  '材料科学与工程学院': ['beiyang'],
  '环境科学与工程学院': ['beiyang'],
  '管理与经济学部': ['weijin'],
  '人文艺术学院': ['weijin'],
  '外国语学院': ['beiyang'],
  '法学院': ['weijin'],
  '纪检监察学院': ['weijin'],
  '马克思主义学院': ['beiyang'],
  '理学院': ['beiyang'],
  '数学学院': ['beiyang'],
  '医学部': ['weijin'],
  '医学院': ['weijin'],
  '药物科学与技术学院': ['weijin'],
  '生命科学学院': ['weijin'],
  '卫生应急学院': ['weijin'],
  '海洋科学与技术学院': ['weijin'],
  '地球系统科学学院': ['weijin'],
  '能源学院': ['beiyang'],
  '未来技术学院': bothCampuses,
  '宣怀学院': bothCampuses,
  '国家卓越工程师学院': bothCampuses,
  '国际工程师学院': ['weijin', 'beiyang'],
  '教育学院': ['beiyang'],
  '国际教育学院': ['weijin', 'beiyang'],
  '新媒体与传播学院': ['weijin', 'beiyang'],
  '分子+研究院': ['weijin'],
  '分子聚集态科学研究院': ['weijin']
}
const graduateOnlyFixtures = new Set([
  '卫生应急学院','能源学院','宣怀学院','国家卓越工程师学院','国际工程师学院',
  '教育学院','国际教育学院','分子+研究院','分子聚集态科学研究院'
])

function campusesForCollege(name) { return campusByCollege[name] || [] }

function collegesForCampus(campus) {
  if (!['weijin', 'beiyang'].includes(campus)) return colleges.slice()
  return colleges.filter(name => campusesForCollege(name).includes(campus))
}

function fixtureGrade(college, index) {
  const available = graduateOnlyFixtures.has(college) ? grades.slice(4) : grades
  return available[index % available.length]
}

function matchesCollege(value, filter) {
  return !filter || filter === 'all' || value === filter || (divisions[filter] || []).includes(value)
}

function matchesGrade(value, filter) {
  if (!filter || filter === 'all') return true
  return filter === '研究生' ? ['研一', '研二', '研三', '博士', '研究生'].includes(value) : value === filter
}

module.exports = { colleges, grades, matchesCollege, matchesGrade, campusesForCollege, collegesForCampus, fixtureGrade }
