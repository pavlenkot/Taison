"use client";
import { useState } from "react";
import { Icon } from "./Icon";
export function ExportPanel() {
  const [period, setPeriod] = useState("month");
  return (
    <section className="card">
      <div className="flex items-center gap-3 mb-5">
        <span className="icon-circle">
          <Icon name="download" size={32} />
        </span>
        <h2>Експорт даних</h2>
      </div>
      <label className="block">
        <span className="label">Період</span>
        <select
          className="field"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="month">Цей місяць</option>
          <option value="year">Цей рік</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <a
          href={"/api/export?format=xlsx&period=" + period}
          className="btn-outline !text-positive"
        >
          <Icon name="categories" size={22} />
          Excel
        </a>
        <a
          href={"/api/export?format=csv&period=" + period}
          className="btn-outline !text-[#81D8D0]"
        >
          <Icon name="documents" size={22} />
          CSV
        </a>
      </div>
    </section>
  );
}
