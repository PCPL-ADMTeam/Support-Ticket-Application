const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const categorySelect = {
  id: true,
  name: true,
  description: true,
  parentId: true,
  isActive: true,
  children: { select: { id: true, name: true, isActive: true } },
};

async function listCategories() {
  // Top-level categories with their sub-categories nested, for a tree UI.
  return prisma.category.findMany({
    where: { parentId: null },
    select: categorySelect,
    orderBy: { name: "asc" },
  });
}

async function createCategory(actorId, { name, description, parentId }) {
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new ApiError(400, "Parent category not found");
  }
  const category = await prisma.category.create({ data: { name, description, parentId }, select: categorySelect });
  await recordAudit({ userId: actorId, action: "CATEGORY_CREATED", entityType: "Category", entityId: category.id, newValues: { name, parentId } });
  return category;
}

async function updateCategory(actorId, id, { name, description, isActive }) {
  const data = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (isActive !== undefined) data.isActive = isActive;

  const category = await prisma.category.update({ where: { id }, data, select: categorySelect });
  await recordAudit({ userId: actorId, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id, newValues: { name, description, isActive } });
  return category;
}

async function deleteCategory(actorId, id) {
  const inUse = await prisma.ticket.count({ where: { categoryId: id } });
  if (inUse > 0) throw new ApiError(409, "Cannot delete a category that has tickets. Deactivate it instead.");
  await prisma.category.delete({ where: { id } });
  await recordAudit({ userId: actorId, action: "CATEGORY_DELETED", entityType: "Category", entityId: id });
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
