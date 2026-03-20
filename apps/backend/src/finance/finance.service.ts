import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';

type ChargeStatusInput = 'pending' | 'paid' | 'overdue' | 'canceled';
type TransactionStatusInput = 'pending' | 'success' | 'failed' | 'refunded';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [totalCharges, pendingCharges, paidCharges, overdueCharges] =
      await Promise.all([
        this.prisma.monthlyCharge.count(),
        this.prisma.monthlyCharge.count({ where: { status: 'PENDING' } }),
        this.prisma.monthlyCharge.count({ where: { status: 'PAID' } }),
        this.prisma.monthlyCharge.count({ where: { status: 'OVERDUE' } }),
      ]);

    const amountByStatus = await this.prisma.monthlyCharge.groupBy({
      by: ['status'],
      _sum: {
        amount: true,
      },
    });

    return {
      totalCharges,
      pendingCharges,
      paidCharges,
      overdueCharges,
      amountByStatus: amountByStatus.map((item) => ({
        status: item.status.toLowerCase(),
        amount: Number(item._sum.amount ?? 0),
      })),
    };
  }

  async findCharges() {
    const charges = await this.prisma.monthlyCharge.findMany({
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return charges.map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
      paymentTransactions: charge.paymentTransactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
    }));
  }

  async createCharge(dto: CreateChargeDto) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: dto.enrollmentId },
      select: { id: true },
    });

    if (!enrollment) {
      throw new NotFoundException('Matrícula não encontrada.');
    }

    const charge = await this.prisma.monthlyCharge.create({
      data: {
        enrollmentId: dto.enrollmentId,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        externalChargeId: dto.externalChargeId?.trim() || null,
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    });

    return {
      ...charge,
      amount: Number(charge.amount),
    };
  }

  async updateChargeStatus(chargeId: string, dto: UpdateChargeStatusDto) {
    const charge = await this.prisma.monthlyCharge.findUnique({
      where: { id: chargeId },
      select: { id: true },
    });

    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }

    const updatedCharge = await this.prisma.monthlyCharge.update({
      where: { id: chargeId },
      data: {
        status: this.toPrismaChargeStatus(dto.status),
      },
      include: {
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            schoolClass: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    });

    return {
      ...updatedCharge,
      amount: Number(updatedCharge.amount),
    };
  }

  async createTransaction(dto: CreateTransactionDto) {
    const charge = await this.prisma.monthlyCharge.findUnique({
      where: { id: dto.monthlyChargeId },
      select: {
        id: true,
        amount: true,
      },
    });

    if (!charge) {
      throw new NotFoundException(
        'Cobrança não encontrada para este lançamento.',
      );
    }

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'O valor da transação precisa ser maior que zero.',
      );
    }

    const status: string = dto.status ?? 'success';
    const transaction = await this.prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.paymentTransaction.create({
        data: {
          monthlyChargeId: dto.monthlyChargeId,
          provider: dto.provider?.trim() || 'manual',
          amount: dto.amount,
          status: this.toPrismaTransactionStatus(status),
          externalTransactionId: dto.externalTransactionId?.trim() || null,
          paidAt: dto.paidAt
            ? new Date(dto.paidAt)
            : status === 'success'
              ? new Date()
              : null,
        },
      });

      if (status === 'success') {
        await tx.monthlyCharge.update({
          where: { id: dto.monthlyChargeId },
          data: {
            status: 'PAID',
          },
        });
      }

      return createdTransaction;
    });

    return {
      ...transaction,
      amount: Number(transaction.amount),
    };
  }

  private toPrismaChargeStatus(status: string) {
    const statusMap: Record<
      ChargeStatusInput,
      'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED'
    > = {
      pending: 'PENDING',
      paid: 'PAID',
      overdue: 'OVERDUE',
      canceled: 'CANCELED',
    };

    const normalizedStatus = status as ChargeStatusInput;
    const mappedStatus = statusMap[normalizedStatus];
    if (!mappedStatus) {
      throw new BadRequestException('Status de cobrança inválido.');
    }

    return mappedStatus;
  }

  private toPrismaTransactionStatus(status: string) {
    const statusMap: Record<
      TransactionStatusInput,
      'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
    > = {
      pending: 'PENDING',
      success: 'SUCCESS',
      failed: 'FAILED',
      refunded: 'REFUNDED',
    };

    const normalizedStatus = status as TransactionStatusInput;
    const mappedStatus = statusMap[normalizedStatus];
    if (!mappedStatus) {
      throw new BadRequestException('Status de transação inválido.');
    }

    return mappedStatus;
  }
}
