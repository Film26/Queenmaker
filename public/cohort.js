// public/cohort.js

function renderCohortHeatmap(filteredData, rawData) {
  const container = document.getElementById('view-cohort');
  
  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 50px; color: #888;">No data available for cohort heatmap.</p>';
    return;
  }

  // 1. Find Cohort Month for each user using ALL rawData (True first purchase date)
  const userCohorts = {};
  rawData.forEach(row => {
    const id = row['Customer ID'] || row['รหัสลูกค้า (ลูกค้า) ไม่ใช้'] || row['Phone'];
    const dateStr = row['วันที่สร้าง'] || row['วันที่โอนเงิน'];
    if (!id || !dateStr) return;
    
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length < 3) return;
    let y = parseInt(parts[2]);
    let m = parseInt(parts[1]);
    if (y < 2000) y += 2000;
    
    const monthStr = `${y}-${m.toString().padStart(2, '0')}`;
    const val = y * 100 + m;
    
    if (!userCohorts[id] || val < userCohorts[id].val) {
      userCohorts[id] = { val: val, monthStr: monthStr, year: y, month: m };
    }
  });

  // 2. Aggregate Active Users by Cohort Month and Lifetime Month based on filteredData
  const cohortData = {};
  let maxLifetime = 0;

  filteredData.forEach(row => {
    const id = row['Customer ID'] || row['รหัสลูกค้า (ลูกค้า) ไม่ใช้'] || row['Phone'];
    const dateStr = row['วันที่สร้าง'] || row['วันที่โอนเงิน'];
    if (!id || !dateStr || !userCohorts[id]) return;

    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length < 3) return;
    let y = parseInt(parts[2]);
    let m = parseInt(parts[1]);
    if (y < 2000) y += 2000;
    
    const cohort = userCohorts[id];
    
    // Calculate how many months since their first purchase
    const monthDiff = (y - cohort.year) * 12 + (m - cohort.month);
    
    if (monthDiff >= 0) {
      const cMonth = cohort.monthStr;
      if (!cohortData[cMonth]) cohortData[cMonth] = {};
      if (!cohortData[cMonth][monthDiff]) cohortData[cMonth][monthDiff] = new Set();
      
      cohortData[cMonth][monthDiff].add(id);
      
      if (monthDiff > maxLifetime) {
        maxLifetime = monthDiff;
      }
    }
  });

  // Limit max columns to prevent infinite scroll horizontally
  if (maxLifetime > 48) maxLifetime = 48;

  const sortedCohorts = Object.keys(cohortData).sort();
  
  if (sortedCohorts.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 50px; color: #888;">No cohort data available for selected filters.</p>';
    return;
  }

  // AI Summary Logic (Rule-based)
  let bestMonth1Cohort = { month: '-', pct: 0 };
  let totalMonth1Pct = 0;
  let month1Count = 0;
  
  sortedCohorts.forEach(cMonth => {
    const data = cohortData[cMonth];
    const size = data[0] ? data[0].size : 0;
    if (size > 0 && data[1]) {
        const m1Pct = (data[1].size / size) * 100;
        totalMonth1Pct += m1Pct;
        month1Count++;
        if (m1Pct > bestMonth1Cohort.pct) {
            bestMonth1Cohort = { month: cMonth, pct: m1Pct };
        }
    }
  });

  let aiSummaryHtml = '';
  if (month1Count > 0) {
      const avgM1 = (totalMonth1Pct / month1Count).toFixed(1);
      aiSummaryHtml = `
      <div style="background: linear-gradient(135deg, #fef6e4, #fdf1e6); border-left: 4px solid #d95f1d; padding: 20px; border-radius: 8px; margin-bottom: 25px; display: flex; gap: 15px; align-items: flex-start;">
        <i class="fas fa-brain" style="color: #d95f1d; font-size: 24px; margin-top: 5px;"></i>
        <div>
            <h4 style="margin: 0 0 10px 0; color: #d95f1d; font-size: 16px;">AI Analytics Summary (Rule-based Prototype)</h4>
            <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.6;">
                <li><strong>ภาพรวม Retention:</strong> มีกลุ่มลูกค้าทั้งหมด ${sortedCohorts.length} กลุ่ม (Cohorts) โดยมีอัตราการซื้อซ้ำในเดือนที่ 1 เฉลี่ยอยู่ที่ <strong>${avgM1}%</strong></li>
                <li><strong>กลุ่มลูกค้าที่โดดเด่นที่สุด:</strong> กลุ่มลูกค้าใหม่ที่เข้ามาในเดือน <strong>${bestMonth1Cohort.month}</strong> มีอัตราการซื้อซ้ำเดือนที่ 1 สูงที่สุดถึง <strong>${bestMonth1Cohort.pct.toFixed(1)}%</strong> แนะนำให้ตรวจสอบแคมเปญในเดือนดังกล่าวเพื่อนำมาปรับใช้ต่อ</li>
                <li><strong>ข้อเสนอแนะจากระบบ:</strong> ควรจัดโปรโมชั่นหรือส่ง CRM Message กระตุ้นลูกค้าในช่วงเปลี่ยนผ่านเข้าสู่เดือนที่ 1 (หลังจากซื้อครั้งแรก) เนื่องจากเป็นช่วงเวลาที่มีโอกาสลูกค้าสูญหาย (Drop-off) สูงที่สุด</li>
            </ul>
        </div>
      </div>
      `;
  }

  // 3. Build HTML Table
  let html = aiSummaryHtml + `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3 style="margin: 0; color: #333; font-size: 18px;">Cohort Analysis (Retention Rate %)</h3>
    </div>
    <div style="overflow-x: auto; padding-bottom: 20px;">
    <table class="cohort-table" style="width: 100%; border-collapse: collapse; text-align: center; font-size: 13px;">
      <thead>
        <tr style="background-color: #f9f9f9;">
          <th style="padding: 12px; border-bottom: 2px solid #ddd; text-align: left;">CohortMonth</th>
  `;`;
  
  for (let i = 0; i <= maxLifetime; i++) {
    html += `<th>${i}</th>`;
  }
  html += `<th>Cohort Size</th></tr></thead><tbody>`;

  sortedCohorts.forEach(cMonth => {
    const data = cohortData[cMonth];
    const size = data[0] ? data[0].size : 0;
    
    if (size === 0) return; // Skip cohorts where no new users showed up in Month 0
    
    html += `<tr>
      <td class="cohort-label">${cMonth}</td>
    `;
    
    for (let i = 0; i <= maxLifetime; i++) {
      if (data[i]) {
        const count = data[i].size;
        const pct = (count / size) * 100;
        
        let bgColor = '';
        if (i === 0) bgColor = '#52c473'; // 100%
        else if (pct >= 40) bgColor = '#73d18e';
        else if (pct >= 20) bgColor = '#94dea9';
        else if (pct >= 10) bgColor = '#b5ebc4';
        else if (pct >= 5) bgColor = '#d6f8df';
        else if (pct > 0) bgColor = '#f0fcf3';
        else bgColor = '#ffffff';
        
        const txtColor = (i === 0 || pct >= 20) ? '#000' : '#444';
        const displayVal = pct > 0 ? pct.toFixed(1) + '%' : '';
        
        html += `<td class="cohort-cell" style="background-color: ${bgColor}; color: ${txtColor};" title="${count} users">
          ${displayVal}
        </td>`;
      } else {
        html += `<td class="cohort-cell empty"></td>`;
      }
    }
    
    html += `<td class="cohort-size">${size.toLocaleString()}</td></tr>`;
  });

  html += `</tbody></table></div>`;
  
  container.innerHTML = html;
}
