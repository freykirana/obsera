/*
  Warnings:

  - A unique constraint covering the columns `[source_ip]` on the table `attackers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "attackers_source_ip_key" ON "attackers"("source_ip");
