// These profile fields are persisted with the local mock identity. Listings expose only the relation.
function proximity(user, seller, product) {
  const isPeer = Boolean(user && seller && user.id !== seller.id)
  const sameCampus = Boolean(isPeer && user.campusId && product.campusId === user.campusId)
  const sameDorm = Boolean(sameCampus && user.dorm && user.dorm === seller.dorm)
  const sameCollege = Boolean(isPeer && user.college && user.college === seller.college)
  const sameGrade = Boolean(isPeer && user.grade && user.grade === seller.grade)
  return {
    sameCampus, sameDorm, sameCollege, sameGrade,
    distance: sameDorm ? 3 : sameCollege ? 2 : sameCampus ? 1 : 0
  }
}

module.exports = { proximity }
