import ExcelJS from 'exceljs';
import { categoryName } from '~/lib/categoryName';
import type { EgtApparatus } from '~/modules/egt/module';
import type { ServerT } from '~/locales';
import type { StarterRow } from './starterRow';

export async function createStartersWorkbook(rows: readonly StarterRow[], t: ServerT) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t('starters:title'), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  // Text columns have the format "text". exceljs writes strings as strings, and the format keeps
  // names starting with = + - @ from becoming formulas when a cell is edited.
  const text = { numFmt: '@' };
  sheet.columns = [
    { header: t('fields.stvId'), key: 'stvId', width: 12, style: text },
    { header: t('fields.firstname'), key: 'firstname', width: 18, style: text },
    { header: t('fields.lastname'), key: 'lastname', width: 18, style: text },
    { header: t('fields.sex'), key: 'sex', width: 12, style: text },
    { header: t('fields.birthYear'), key: 'birthYear', width: 10 },
    { header: t('fields.club'), key: 'club', width: 26, style: text },
    { header: t('fields.location'), key: 'location', width: 18, style: text },
    { header: t('fields.category'), key: 'category', width: 10, style: text },
    { header: t('starters:division'), key: 'division', width: 10 },
    { header: t('fields.startApparatus'), key: 'startApparatus', width: 16, style: text },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      stvId: row.stvId,
      firstname: row.firstname,
      lastname: row.lastname,
      sex: t(`sex.${row.sex}`),
      birthYear: row.birthYear,
      club: row.club.name,
      location: row.club.location,
      category: row.category && categoryName(row.category, t),
      division: row.divisionNumber,
      startApparatus: row.startApparatus && t(`apparatus.${row.startApparatus as EgtApparatus}`),
    });
  }
  return workbook.xlsx.writeBuffer();
}
